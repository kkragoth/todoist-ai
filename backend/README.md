# Backend

FastAPI service: LLM chat, todo REST, and MCP — all over one `todo.service`
domain layer. Postgres + Redis via docker compose; API on `:8000`.

```bash
just dev           # full stack: infra (detached) + reload API in foreground
just dev-detached  # everything in background
just dev-local     # bare-metal python, only postgres+redis in docker
```

| Surface | Endpoint |
| ------- | -------- |
| Chat (LLM ReAct loop, SSE) | `POST /api/chat` |
| Todos (REST) | `/api/todos` |
| Todos (MCP, Streamable HTTP) | `POST /mcp/` |
| Auth | `POST /auth/register`, `POST /auth/token`, `GET /auth/me` |
| Health / docs | `/health`, `/docs` |

Env lives in `backend/.env` (`POSTGRES_*`, `DATABASE_URL`, `REDIS_URL`).
MCP details + client setup: see root `README.md` ("Connect to MCP").
