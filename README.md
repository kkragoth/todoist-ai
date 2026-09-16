# Todoist AI

Reference example of adding MCP to a Python FastAPI backend built over a
CRUD resource (todos), extended with LLM chat that can drive gated UI updates:
the chat ReAct loop emits `ui_action` / widget events only to clients that
advertise the `ui_action` capability, so the LLM can change the web UI while
plain clients stay text-only.

AI todo app: FastAPI backend (LLM chat + REST + MCP), OpenTUI chat CLI, web frontend.

## Demo

[![Todoist AI Demo](https://img.youtube.com/vi/stUHhtTdR_E/maxresdefault.jpg)](https://youtu.be/stUHhtTdR_E)

Watch the demo: https://youtu.be/stUHhtTdR_E

| Dir | What |
| --- | ---- |
| `backend/` | FastAPI: `/api/chat` (LLM ReAct loop), `/api/todos` (REST), `/mcp/` (MCP) |
| `cli/` | OpenTUI chat CLI (`todoist-ai`), incl. `--mcp-direct` mode |
| `frontend/` | Web client |
| `agentic-cli/` | Earlier agentic CLI prototype |
| `scripts/` | Helper script: register a user (bash + PowerShell) |
| `mcp_config/` | Ready-made MCP client configs (`opencode.json`, `claude-mcp.json`, `codex.toml`) |

## Connect to MCP

The backend exposes the same todo service as an MCP server over
**Streamable HTTP** at `POST /mcp/` (trailing slash):

- **Tools** (mutations + structured reads): `list_todos`, `list_todos_structured`,
  `add_todo`, `update_todo`, `archive_todo` (soft-hide), `delete_todo` (hard delete)
- **Resources** (URI reads): `todo://todos`, `todo://todos/{id}`
- **Prompts**: `triage_todos`, `plan_day`

Every tool/resource call is authenticated — via OAuth (MCP clients) or a
`Authorization: Bearer` JWT (REST, CLI, direct API use). No manual token
handling: MCP clients log in with the todoist-ai account from step 2, and
the model never sees credentials.

### 1. Start the backend

```bash
cd backend && just dev
```

This brings up the full docker dev stack (postgres + redis + debug UIs
detached) and runs the reload-enabled API in the foreground on
`http://localhost:8000` — `./src` is mounted, so edits apply live.
Variants: `just dev-detached` (everything in the background),
`just dev-local` (bare-metal python, only infra in docker).

### 2. Register a user (once)

```bash
./scripts/register.sh myuser mypassword
# PowerShell: .\scripts\register.ps1 -Username myuser -Password mypassword
```

Args fall back to `TODO_USER` / `TODO_PASS` env, then to prompts.
Override the backend URL with `TODO_API_URL` (default `http://localhost:8000`).

### 3a. Use it from opencode (OAuth)

`mcp_config/opencode.json` is a drop-in config pointing at the local server:

```bash
cp mcp_config/opencode.json ./opencode.json && opencode
# or install globally: cp mcp_config/opencode.json ~/.config/opencode/opencode.json
```

Then authenticate once — a browser login page for the account from step 2
opens, no tokens to paste:

```bash
opencode mcp auth todoist-ai
```

Tokens are stored by opencode in `~/.local/share/opencode/mcp-auth.json` and
refreshed automatically. Useful extras:

```bash
opencode mcp list              # auth status of all servers
opencode mcp debug todoist-ai  # diagnose the OAuth discovery flow
opencode mcp logout todoist-ai # drop stored credentials
```

Then prompt with e.g. `list my todos use todoist-ai`.

Notes:

- Upgrading from the old static-header setup? Delete the `oauth: false`
  and `headers` keys from your existing `todoist-ai` config entry, then
  re-run `opencode mcp auth todoist-ai`.
- Serving the backend publicly (tunnel/proxy)? Set `MCP_BASE_URL` in
  `backend/.env` to the reachable root URL so OAuth discovery advertises
  working authorize/token URLs.

### 3b. Use it from Claude Code (OAuth)

`mcp_config/claude-mcp.json` is a drop-in project config:

```bash
cp mcp_config/claude-mcp.json ./.mcp.json
# or: claude mcp add --transport http todoist-ai http://localhost:8000/mcp/
```

Claude Code discovers OAuth from
`/.well-known/oauth-protected-resource` and opens the browser login for
the account from step 2 — no tokens to paste. Then prompt with e.g.
`list my todos use todoist-ai`.

### 3c. Use it from Codex (OAuth)

Append `mcp_config/codex.toml` to your Codex config (`~/.codex/config.toml`,
or `.codex/config.toml` for a project-scoped server):

```bash
cat mcp_config/codex.toml >> ~/.codex/config.toml
# or: codex mcp add todoist-ai --url http://localhost:8000/mcp/
```

Then authenticate once — a browser login page for the account from step 2
opens, no tokens to paste:

```bash
codex mcp login todoist-ai
```

Tokens are stored by Codex (system keyring, encrypted file fallback) and
refreshed automatically. Useful extras:

```bash
codex mcp list            # auth status of all servers
codex mcp logout todoist-ai # drop stored credentials
```

### 3d. Use it from the CLI (`--mcp-direct`)

```bash
cd cli && npm install && npm run build
todoist-ai --mcp-direct   # or TODO_MCP_DIRECT=1
```

Sign-in is browser OAuth (same flow as opencode above — no tokens to
paste); `--allow-password-login` (or `TODO_ALLOW_PASSWORD_LOGIN=1`)
additionally shows username/password tabs for headless use.

Direct mode talks MCP straight from the CLI, bypassing the LLM:
`/tools`, `/resources`, `/prompts`, `/list [query]`, `/read <id>`,
`/add <task>`, `/done`, `/reopen`, `/archive`, `/delete`, `/mcp [on|off]`.
Plain text lists via MCP while the mode is on (`MCP-DIRECT` badge in the header).

## Auth

- MCP clients use OAuth 2.1: dynamic client registration, PKCE,
  login/consent at `GET /oauth/login`, refresh + revocation, and discovery
  at `/.well-known/oauth-authorization-server` and
  `/.well-known/oauth-protected-resource/mcp` — so `opencode mcp auth`,
  Claude Code, and `codex mcp login` all work with no manual token handling.
- REST (`/api/todos`, `/api/chat`), the CLI, and direct API/MCP use accept
  `Authorization: Bearer` JWTs from `POST /auth/token` (OAuth access tokens
  are the same JWT format). Manual token for curl/testing:

```bash
curl -s -X POST http://localhost:8000/auth/token \
  -d 'username=myuser&password=mypassword' | python3 -c \
  'import sys, json; print(json.load(sys.stdin)["access_token"])'
```

## TODO

- [x] MCP OAuth support — the backend is its own OAuth 2.1 authorization
  server; clients like opencode authenticate via `opencode mcp auth`
  instead of pasting JWTs.
