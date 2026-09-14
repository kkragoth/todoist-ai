# todoist-ai CLI (OpenTUI chat client)

Terminal chat for the Todoist AI backend. The ReAct loop lives server-side
(`POST /api/chat`, SSE events) — this CLI is a thin renderer + input box,
replacing the local loop that used to live in `agentic-cli/`.

Stack: TypeScript + [`@opentui/react`](https://www.npmjs.com/package/@opentui/react)
+ [`@opentui/core`](https://www.npmjs.com/package/@opentui/core), with UI
built from [termcn](https://www.termcn.dev/) OpenTUI components, vendored
under `src/components/ui/` (no registry dependency at runtime):

- `ChatMessage` — user / assistant / system bubbles (+`selectable` passthrough)
- `StreamingText` — assistant answer (+`selectable` passthrough)
- `ThinkingBlock` — per-turn collapsible tool summary (parent-controlled collapse)
- `ToolCall` — one row per invocation: status icon, args, result, duration
- `Spinner` (`cli-spinners` + local `use-animation`) — working indicator
- `use-theme` + default theme (provider-optional, defaults apply)

Adaptations vs upstream: collapse is parent-controlled (termcn's global
return/space key handlers would flip every row at once), and text takes a
`selectable` prop for drag-to-copy.

## Run (Node 26+ required for OpenTUI's `node:ffi`)

```bash
cd cli
npm install
npm run dev        # tsx; --experimental-ffi is wired into the script
# or
npm run build && npm start
```

Flags / env (same backend as `agentic-cli`):

| Flag | Env | Default |
| ---- | --- | ------- |
| `--api-url` | `TODO_API_URL` | `http://localhost:8000` |
| `--thread` | `TODO_THREAD` | most recent |
| `--provider` | `TODO_PROVIDER` | server default |
| `--model` | `TODO_MODEL` | server default |

Threads are numeric server-side. The CLI learns the resolved id from the
`X-Chat-Thread-Id` response header and shows it in the header bar; omit
`--thread` to continue the most recent one.

Auth reuses `~/.todoist-ai-cli/token.json` (same file as `agentic-cli`),
validated against `GET /auth/me` on boot.

## Protocol (backend contract)

- `POST /api/chat` `{message, thread_id, provider?, model?}` → SSE `data:` frames:
  `token` / `tool_call` / `tool_result` / `done` / `error`
- `DELETE /api/chat/history?thread_id=` clears the thread (`/clear`)
- Auth: `POST /auth/token` (form), `POST /auth/register` (JSON), `GET /auth/me`

## In-app commands

`/help` · `/clear` · `/thread [id]` · `/threads` · `/provider [name]` ·
`/model [name]` · `/logout` · `/quit` — typing `/` pops up completions
(`tab` accepts, `↑↓` navigates, `esc` dismisses).

## Keys & behavior

- `enter` sends; while a turn is running it **queues** the message and sends
  it right after (queued rows show dimmed in the transcript).
- Each turn renders `You:` → `⠋ Thinking…` (live tool lines) → `Assistant:`.
  When done the thinking block collapses to `✓ 3.2s · 2 tool calls`;
  `ctrl+t` expands/collapses the latest one.
- `esc` cancels a turn, `pgup`/`pgdn` scrolls the transcript (it sticks to
  the bottom while new output streams), `ctrl+c` exits.
- **Copy:** drag-select any message text with the mouse — it copies via OSC52
  and the status line confirms. (If your terminal blocks OSC52, use Opt/Alt+drag
  for native selection.)
