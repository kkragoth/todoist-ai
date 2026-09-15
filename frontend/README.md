# Frontend

React + Vite + Tailwind web client for the backend (chat + todo widgets).

```bash
npm install
npm run dev      # vite dev server
npm run build    # tsc + vite build
```

Talks to the backend same-origin (Vite dev proxy forwards `/auth` + `/api`
to `http://localhost:8000`; override with `VITE_API_URL`).
Backend runs via `just dev` in `backend/`.
MCP setup: see root `README.md` ("Connect to MCP").
