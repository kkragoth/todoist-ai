# CLI

OpenTUI terminal chat for the backend. The ReAct loop lives server-side
(`POST /api/chat`, SSE) — this is a thin renderer + input box.

```bash
npm install
npm run dev        # tsx (Node 26+ for node:ffi)
npm run build && npm start
```

| Flag | Env | Default |
| ---- | --- | ------- |
| `--api-url` | `TODO_API_URL` | `http://localhost:8000` |
| `--thread` | `TODO_THREAD` | most recent |
| `--provider` / `--model` | `TODO_PROVIDER` / `TODO_MODEL` | server default |
| `--mcp-direct` | `TODO_MCP_DIRECT=1` | off |
| `--allow-password-login` | `TODO_ALLOW_PASSWORD_LOGIN=1` | off (browser OAuth only) |

Sign-in is browser OAuth by default: the CLI registers itself with the
backend (dynamic client registration), opens the login page, and stores
tokens in `~/.todoist-ai-cli/oauth.json` (refresh is automatic).
`--allow-password-login` additionally shows username/password tabs for
headless use; the access token cache stays at
`~/.todoist-ai-cli/token.json`. Full command/key list: `/help` in-app.
MCP setup: see root `README.md` ("Connect to MCP").

Direct mode talks MCP straight from the CLI, bypassing the LLM
(it signs in with the same OAuth browser flow, then lists/reads/writes
over Streamable HTTP):
`/tools`, `/resources`, `/prompts`, `/list [query]`, `/read <id>`,
`/add <task>`, `/done`, `/reopen`, `/archive`, `/delete`, `/mcp [on|off]`.
Plain text lists via MCP while the mode is on (`MCP-DIRECT` badge in the header).

Auth reuses `~/.todoist-ai-cli/token.json` (access token cache) plus
`~/.todoist-ai-cli/oauth.json` (OAuth client + refresh tokens).
Full command/key list: `/help` in-app. MCP setup: see root `README.md`
("Connect to MCP").
