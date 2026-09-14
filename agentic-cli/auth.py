"""Terminal auth helper for the Todoist AI backend (ported from todo-mcp-app)."""

import json
import os
from pathlib import Path

import requests

TOKEN_FILE = Path.home() / ".todoist-ai-cli" / "token.json"
API_BASE_URL = os.environ.get("TODO_API_URL", "http://localhost:8000")


def get_stored_token() -> str | None:
    """Read saved access token from disk."""
    if TOKEN_FILE.exists():
        try:
            data = json.loads(TOKEN_FILE.read_text())
            return data.get("access_token")
        except Exception:
            return None
    return None


def save_token(data: dict):
    """Save token dict to disk."""
    TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
    TOKEN_FILE.write_text(json.dumps(data))


def clear_stored_token():
    """Remove saved session (e.g. after /auth/me rejects it)."""
    try:
        if TOKEN_FILE.exists():
            TOKEN_FILE.unlink()
    except Exception:
        pass


def fetch_me(token: str | None) -> dict | None:
    """Validate a token against GET /auth/me. Returns profile or None."""
    if not token:
        return None
    try:
        res = requests.get(
            f"{API_BASE_URL}/auth/me",
            headers={"Authorization": f"Bearer {token}"},
            timeout=5,
        )
    except Exception:
        return None
    if res.status_code == 200:
        try:
            return res.json()
        except Exception:
            return None
    return None


def register_user(username: str, password: str) -> dict:
    """Register a new user against backend API."""
    res = requests.post(
        f"{API_BASE_URL}/auth/register",
        json={"username": username, "password": password},
    )
    res.raise_for_status()
    return res.json()


def login_user(username: str, password: str) -> str:
    """Obtain access token via username/password."""
    res = requests.post(
        f"{API_BASE_URL}/auth/token",
        data={"username": username, "password": password},
    )
    if res.status_code != 200:
        raise ValueError(f"Login failed ({res.status_code}): {res.text}")

    data = res.json()
    token = data.get("access_token")
    if not token:
        raise ValueError("Backend response did not include 'access_token'")

    save_token(data)
    return token


def get_or_prompt_auth() -> str:
    """Return stored token if GET /auth/me accepts it, else prompt login/register."""
    token = get_stored_token()
    if token:
        profile = fetch_me(token)
        if profile:
            print(f"\n✅ Logged in as {profile.get('username')} (session restored)")
            return token
        print("\n⚠️  Saved session expired or invalid — please log in again.")
        clear_stored_token()

    while True:
        print("\n🔐 Todoist AI Authentication Required")
        print("1. Login")
        print("2. Register new account")

        try:
            choice = input("Select option (1/2) [default: 1]: ").strip() or "1"
            username = input("Username: ").strip()
            password = input("Password: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nAborted.")
            raise SystemExit(1)

        if not username or not password:
            print("Username and password are required. Try again.")
            continue

        try:
            if choice == "2":
                print("Registering new user...")
                try:
                    register_user(username, password)
                except requests.HTTPError as e:
                    # Bring the user back to the prompt instead of crashing,
                    # e.g. username taken.
                    detail = e.response.text if e.response is not None else str(e)
                    print(f"❌ Registration failed: {detail}")
                    continue
                print("✅ Registration successful. Logging in...")

            token = login_user(username, password)
        except ValueError as e:
            print(f"❌ {e}")
            continue
        except requests.HTTPError as e:
            detail = e.response.text if e.response is not None else str(e)
            print(f"❌ Request failed: {detail}")
            continue

        print("✅ Authenticated successfully!\n")
        return token
