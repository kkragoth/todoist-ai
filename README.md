# Todoist AI

AI todo app: FastAPI backend (LLM chat + REST + MCP), OpenTUI chat CLI, web frontend.

| Dir | What |
| --- | ---- |
| `backend/` | FastAPI: `/api/chat` (LLM ReAct loop), `/api/todos` (REST), `/mcp/` (MCP) |
| `cli/` | OpenTUI chat CLI (`todoist-ai`), incl. `--mcp-direct` mode |
| `frontend/` | Web client |
| `agentic-cli/` | Earlier agentic CLI prototype |
| `scripts/` | Helper scripts: register a user, fetch a login token (bash + PowerShell) |
| `mcp_config/` | Ready-made MCP client config (`opencode.json`) |

## Connect to MCP

The backend exposes the same todo service as an MCP server over
**Streamable HTTP** at `POST /mcp/` (trailing slash):

- **Tools** (mutations + structured reads): `list_todos`, `list_todos_structured`,
  `add_todo`, `update_todo`, `archive_todo` (soft-hide), `delete_todo` (hard delete)
- **Resources** (URI reads): `todo://todos`, `todo://todos/{id}`
- **Prompts**: `triage_todos`, `plan_day`

Every tool/resource call needs your JWT as an `Authorization: Bearer` header —
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

### 3. Export a login token

```bash
source scripts/set_token.sh myuser mypassword
# PowerShell: . .\scripts\set_token.ps1 -Username myuser -Password mypassword
```

This must be **sourced** (bash) / **dot-sourced** (PowerShell) so
`TODOIST_AI_TOKEN` lands in your current shell. Re-source after re-login —
tokens expire.

### 4a. Use it from opencode

`mcp_config/opencode.json` is a drop-in config pointing at the local server
with the token header:

```bash
source scripts/set_token.sh myuser mypassword
cp mcp_config/opencode.json ./opencode.json && opencode
# or install globally: cp mcp_config/opencode.json ~/.config/opencode/opencode.json
```

Then prompt with e.g. `list my todos use todoist-ai`.
(`oauth: false` is intentional — this server uses plain JWT headers.)

### 4b. Use it from the CLI (`--mcp-direct`)

```bash
cd cli && npm install && npm run build
todoist-ai --mcp-direct   # or TODO_MCP_DIRECT=1
```

Direct mode talks MCP straight from the CLI, bypassing the LLM:
`/tools`, `/resources`, `/prompts`, `/list [query]`, `/read <id>`,
`/add <task>`, `/done`, `/reopen`, `/archive`, `/delete`, `/mcp [on|off]`.
Plain text lists via MCP while the mode is on (`MCP-DIRECT` badge in the header).

## TODO

- [ ] MCP OAuth support — replace the static `TODOIST_AI_TOKEN` header with a
  proper MCP authorization flow (OAuth 2.1 / dynamic client registration),
  so clients like opencode can authenticate via `opencode mcp auth`
  instead of pasting JWTs (`oauth: false` in `mcp_config/opencode.json`
  can then be dropped).
