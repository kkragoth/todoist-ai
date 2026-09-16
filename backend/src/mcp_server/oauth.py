"""OAuth 2.1 authorization server for MCP clients.

Lets MCP clients (e.g. opencode via `opencode mcp auth todoist-ai`) log in
with their existing todoist-ai username/password — no manual token handling.

Design notes:

- Subclasses FastMCP's ``OAuthProvider`` so the MCP SDK owns the protocol
  surface: dynamic client registration (RFC 7591), PKCE verification,
  authorization/token/revocation endpoints, and the
  ``/.well-known/oauth-authorization-server`` +
  ``/.well-known/oauth-protected-resource`` discovery documents that opencode
  needs for its automatic OAuth flow.
- Access tokens are JWTs signed with the same ``SECRET_KEY``/algorithm as
  ``POST /auth/token``. That keeps one credential format everywhere:
  ``TodoOAuthProvider.verify_token`` accepts both OAuth-issued tokens and
  legacy ``/auth/token`` JWTs, so the CLI ``--mcp-direct`` mode and old
  ``Authorization: Bearer`` headers keep working unchanged.
- Storage is in-memory dicts (clients, pending logins, auth codes, refresh
  tokens). Restarting the backend drops sessions and forces re-login, which
  is acceptable for local dev. A multi-replica/production deployment should
  back these dicts with the database.
- The interactive step (username/password + consent) lives on the parent
  FastAPI app at ``GET/POST /oauth/login`` (see ``login_router.py``).
  ``authorize`` stashes the client's request and redirects the browser
  there; the login POST approves it and bounces back to the client's
  ``redirect_uri`` with an auth code.
"""

import os
import secrets
import time

import jwt
from mcp.server.auth.provider import (
    AccessToken,
    AuthorizationCode,
    AuthorizationParams,
    AuthorizeError,
    RefreshToken,
    TokenError,
    construct_redirect_uri,
)
from mcp.shared.auth import OAuthClientInformationFull, OAuthToken

from auth.utils.security import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    ALGORITHM,
    SECRET_KEY,
    create_access_token,
)
from fastmcp.server.auth.auth import (
    ClientRegistrationOptions,
    OAuthProvider,
    RevocationOptions,
)

AUTH_CODE_TTL_SECONDS = 5 * 60
PENDING_LOGIN_TTL_SECONDS = 10 * 60
REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60


def get_public_root_url() -> str:
    """Public backend root URL, e.g. ``http://localhost:8000``.

    ``MCP_BASE_URL`` wins when set (public deployments behind a tunnel or
    reverse proxy must set it so discovery documents advertise reachable
    URLs). Falls back to ``TODO_API_URL`` (already used by the helper
    scripts), then localhost. A trailing ``/mcp`` suffix is stripped: this
    value is the backend root, the ``/mcp`` resource path is appended by
    the provider itself.
    """
    raw = (
        os.getenv("MCP_BASE_URL")
        or os.getenv("TODO_API_URL")
        or "http://localhost:8000"
    ).strip().rstrip("/")
    if raw.lower().endswith("/mcp"):
        raw = raw[: -len("/mcp")]
    return raw or "http://localhost:8000"


class TodoOAuthProvider(OAuthProvider):
    """OAuth provider backed by the existing users table + JWTs."""

    def __init__(
        self,
        *,
        base_url: str | None = None,
        resource_base_url: str | None = None,
    ) -> None:
        root = (base_url or get_public_root_url()).rstrip("/")
        resource = (resource_base_url or f"{root}/mcp").rstrip("/")
        super().__init__(
            base_url=root,
            resource_base_url=resource,
            issuer_url=root,
            client_registration_options=ClientRegistrationOptions(enabled=True),
            revocation_options=RevocationOptions(enabled=True),
        )
        self.public_root = root
        self.clients: dict[str, OAuthClientInformationFull] = {}
        self.pending_logins: dict[str, dict] = {}
        self.auth_codes: dict[str, dict] = {}
        self.refresh_tokens: dict[str, dict] = {}

    # -- dynamic client registration (RFC 7591) -------------------------

    async def get_client(
        self, client_id: str
    ) -> OAuthClientInformationFull | None:
        return self.clients.get(client_id)

    async def register_client(
        self, client_info: OAuthClientInformationFull
    ) -> None:
        if not client_info.client_id:
            raise ValueError("client_id is required for client registration")
        self.clients[client_info.client_id] = client_info

    # -- authorization (login + consent) ---------------------------------

    async def authorize(
        self, client: OAuthClientInformationFull, params: AuthorizationParams
    ) -> str:
        """Park the request and send the browser to the login page."""
        if not client.client_id or client.client_id not in self.clients:
            raise AuthorizeError(
                error="unauthorized_client",
                error_description="Client is not registered.",
            )
        request_id = f"login_{secrets.token_hex(16)}"
        self.pending_logins[request_id] = {
            "client_id": client.client_id,
            "params": params,
            "expires_at": time.time() + PENDING_LOGIN_TTL_SECONDS,
        }
        return f"{self.public_root}/oauth/login?request_id={request_id}"

    def peek_pending_login(self, request_id: str) -> dict | None:
        """Return a pending login without consuming it (for the GET form)."""
        pending = self.pending_logins.get(request_id)
        if pending is None:
            return None
        if pending["expires_at"] < time.time():
            self.pending_logins.pop(request_id, None)
            return None
        return pending

    async def approve_pending_login(
        self, request_id: str, username: str
    ) -> str:
        """Consume a pending login, mint an auth code, return client redirect."""
        pending = self.pending_logins.pop(request_id, None)
        if pending is None:
            raise AuthorizeError(
                error="access_denied",
                error_description="Login request expired — restart the auth flow.",
            )
        if pending["expires_at"] < time.time():
            raise AuthorizeError(
                error="access_denied",
                error_description="Login request expired — restart the auth flow.",
            )
        params: AuthorizationParams = pending["params"]
        scopes = list(params.scopes or [])
        code_value = f"todo_auth_{secrets.token_hex(24)}"
        code = AuthorizationCode(
            code=code_value,
            client_id=pending["client_id"],
            redirect_uri=params.redirect_uri,
            redirect_uri_provided_explicitly=(
                params.redirect_uri_provided_explicitly
            ),
            scopes=scopes,
            expires_at=time.time() + AUTH_CODE_TTL_SECONDS,
            code_challenge=params.code_challenge,
        )
        self.auth_codes[code_value] = {"code": code, "username": username}
        return construct_redirect_uri(
            str(params.redirect_uri), code=code_value, state=params.state
        )

    async def load_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: str
    ) -> AuthorizationCode | None:
        entry = self.auth_codes.get(authorization_code)
        if entry is None:
            return None
        code: AuthorizationCode = entry["code"]
        if code.client_id != client.client_id:
            return None
        if code.expires_at < time.time():
            self.auth_codes.pop(authorization_code, None)
            return None
        return code

    # -- token issuance ---------------------------------------------------

    def _mint_token_pair(
        self, username: str, client_id: str, scopes: list[str]
    ) -> OAuthToken:
        access_token = create_access_token(
            {"sub": username, "cid": client_id}
        )
        refresh_value = f"todo_refresh_{secrets.token_hex(32)}"
        self.refresh_tokens[refresh_value] = {
            "username": username,
            "client_id": client_id,
            "scopes": list(scopes),
            "expires_at": time.time() + REFRESH_TOKEN_TTL_SECONDS,
        }
        return OAuthToken(
            access_token=access_token,
            token_type="Bearer",
            expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            refresh_token=refresh_value,
            scope=" ".join(scopes),
        )

    async def exchange_authorization_code(
        self,
        client: OAuthClientInformationFull,
        authorization_code: AuthorizationCode,
    ) -> OAuthToken:
        entry = self.auth_codes.pop(authorization_code.code, None)
        if entry is None:
            raise TokenError(
                "invalid_grant", "Authorization code not found or already used."
            )
        if not client.client_id:
            raise TokenError("invalid_client", "Client ID is required")
        return self._mint_token_pair(
            entry["username"], client.client_id, authorization_code.scopes
        )

    async def load_refresh_token(
        self, client: OAuthClientInformationFull, refresh_token: str
    ) -> RefreshToken | None:
        entry = self.refresh_tokens.get(refresh_token)
        if entry is None:
            return None
        if entry["client_id"] != client.client_id:
            return None
        if entry["expires_at"] < time.time():
            self.refresh_tokens.pop(refresh_token, None)
            return None
        return RefreshToken(
            token=refresh_token,
            client_id=entry["client_id"],
            scopes=entry["scopes"],
            expires_at=int(entry["expires_at"]),
        )

    async def exchange_refresh_token(
        self,
        client: OAuthClientInformationFull,
        refresh_token: RefreshToken,
        scopes: list[str],
    ) -> OAuthToken:
        if not set(scopes).issubset(set(refresh_token.scopes)):
            raise TokenError(
                "invalid_scope",
                "Requested scopes exceed those authorized by the refresh token.",
            )
        entry = self.refresh_tokens.get(refresh_token.token)
        if entry is None:
            raise TokenError("invalid_grant", "Refresh token not found.")
        # Rotation: the old refresh token is single-use.
        self.refresh_tokens.pop(refresh_token.token, None)
        if not client.client_id:
            raise TokenError("invalid_client", "Client ID is required")
        return self._mint_token_pair(
            entry["username"], client.client_id, scopes
        )

    # -- verification (OAuth JWTs + legacy /auth/token JWTs) --------------

    async def load_access_token(self, token: str) -> AccessToken | None:
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        except Exception:
            return None
        username = payload.get("sub")
        if not username:
            return None
        raw_scopes = payload.get("scope") or payload.get("scp") or ""
        scopes = (
            raw_scopes.split() if isinstance(raw_scopes, str) else list(raw_scopes)
        )
        return AccessToken(
            token=token,
            client_id=str(payload.get("cid") or "legacy"),
            scopes=scopes,
            expires_at=payload.get("exp"),
            subject=username,
            claims=dict(payload),
        )

    async def verify_token(self, token: str) -> AccessToken | None:
        return await self.load_access_token(token)

    async def revoke_token(
        self, token: AccessToken | RefreshToken
    ) -> None:
        """Revoke refresh tokens; JWT access tokens are short-lived."""
        raw = token.token
        self.refresh_tokens.pop(raw, None)


provider_instance: TodoOAuthProvider | None = None


def get_oauth_provider() -> TodoOAuthProvider:
    """Process-wide singleton so HTTP, login UI, and tools share state."""
    global provider_instance
    if provider_instance is None:
        provider_instance = TodoOAuthProvider()
    return provider_instance
