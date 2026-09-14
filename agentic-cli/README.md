# Todoist AI CLI

Minimal ReAct Todo CLI ported from `todo-mcp-app/src/cli/minimal_react.py`.

- Model: Ollama `qwen3.8:27b` (override with `OLLAMA_MODEL`)
- Tools: backend MCP over SSE (`/mcp/sse`), auth via `Authorization` header —
  the model never sees credentials.
- Backend MCP tools (authenticated user only, no presets): `list_todos`,
  `add_todo`, `update_todo` (modify), `archive_todo`.

## Run

```bash
# 1. Start the backend (from ../backend, exposes :8000 + /mcp/sse)
uv run uvicorn main:app --reload --app-dir src

# 2. Run the CLI (from this dir; pulls Ollama model on first use)
uv run python main.py
```

Auth token is cached at `~/.todoist-ai-cli/token.json`.
