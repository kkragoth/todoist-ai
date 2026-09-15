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

`--mcp-direct` talks MCP straight from the CLI, bypassing the LLM:
`/tools`, `/resources`, `/prompts`, `/list [query]`, `/read <id>`,
`/add <task>`, `/done`, `/reopen`, `/archive`, `/delete`, `/mcp [on|off]`.

Auth reuses `~/.todoist-ai-cli/token.json`. Full command/key list: `/help`
in-app. MCP setup: see root `README.md` ("Connect to MCP").
