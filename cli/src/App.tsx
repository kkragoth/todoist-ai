import { useEffect, useRef, useState } from "react";
import type { InputRenderable, ScrollBoxRenderable } from "@opentui/core";
import {
  useKeyboard,
  useRenderer,
  useSelectionHandler,
  useTerminalDimensions,
} from "@opentui/react";
import {
  apiClearHistory,
  apiListThreads,
  apiLogin,
  apiMe,
  apiRegister,
  openChatTurn,
} from "@/api.js";
import { clearToken, loadToken, saveTokenData } from "@/auth-store.js";
import { FeedView } from "@/components/chat-message.js";
import { Spinner } from "@/components/ui/spinner.js";
import {
  appendAnswer,
  cancelTurn,
  completeTurnIfWorking,
  createTurn,
  failTurn,
  nextQueueId,
  nextSystemId,
} from "@/lib/turn.js";
import { isThreadId, submittedText } from "@/lib/text.js";
import type { CliOptions, FeedItem, Turn } from "@/types.js";
import { SLASH_COMMANDS } from "@/types.js";

interface AppProps {
  options: CliOptions;
}

export function App({ options }: AppProps) {
  const renderer = useRenderer();
  const { width, height } = useTerminalDimensions();

  const [token, setToken] = useState<string | null>(() => loadToken());
  const [username, setUsername] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authFocus, setAuthFocus] = useState<"tabs" | "user" | "pass">("tabs");
  const [authUser, setAuthUser] = useState("");
  const [authPass, setAuthPass] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Ready.");
  const [copyFlash, setCopyFlash] = useState("");
  const [threadId, setThreadId] = useState(options.threadId);
  const [provider, setProvider] = useState<string | undefined>(options.provider);
  const [model, setModel] = useState<string | undefined>(options.model);
  const [queue, setQueue] = useState<{ id: number; text: string }[]>([]);
  const [draft, setDraft] = useState("");
  const [completeIdx, setCompleteIdx] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const inputRef = useRef<InputRenderable>(null);
  const scrollRef = useRef<ScrollBoxRenderable>(null);
  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const queueRef = useRef<{ id: number; text: string }[]>([]);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function pushSystem(text: string) {
    setFeed((prev) => [...prev, { kind: "system", id: nextSystemId(), text }]);
  }

  function updateTurn(id: number, fn: (t: Turn) => Turn) {
    setFeed((prev) =>
      prev.map((item) => (item.kind === "turn" && item.turn.id === id ? { ...item, turn: fn(item.turn) } : item)),
    );
  }

  function flash(text: string) {
    setCopyFlash(text);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setCopyFlash(""), 2500);
  }

  // Drag-to-select on any selectable message text copies via OSC52.
  useSelectionHandler((selection) => {
    const text = selection.getSelectedText();
    if (!text || !text.trim()) return;
    let ok = false;
    try {
      ok = renderer.copyToClipboardOSC52(text);
    } catch {
      ok = false;
    }
    flash(ok ? `Copied ${text.length} chars` : "Copy unsupported here — try Opt/Alt+drag");
  });

  // Validate a restored token on boot.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) return;
      const me = await apiMe(options.apiUrl, token);
      if (cancelled) return;
      if (me.status === "ok") {
        setUsername(me.username);
        pushSystem(
          `Signed in as ${me.username} · ${provider ?? "server default"}${model ? `:${model}` : ""}. Type /help for commands.`,
        );
      } else if (me.status === "invalid") {
        clearToken();
        setToken(null);
        setAuthError("Saved session expired — please log in again.");
      } else {
        setStatus(`Backend unreachable at ${options.apiUrl} — token kept, check the server.`);
        pushSystem(`Backend unreachable at ${options.apiUrl}. Start it, then send a message to retry (token kept).`);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tick elapsed timers while a turn is in flight.
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [busy]);

  async function doAuth() {
    const u = authUser.trim();
    if (!u || !authPass) {
      setAuthError("Username and password are required.");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    try {
      if (authMode === "register") {
        await apiRegister(options.apiUrl, u, authPass);
      }
      const accessToken = await apiLogin(options.apiUrl, u, authPass);
      saveTokenData({ access_token: accessToken, token_type: "bearer" });
      setToken(accessToken);
      setUsername(u);
      pushSystem(`Signed in as ${u}. Type /help for commands.`);
      setAuthPass("");
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : String(e));
    } finally {
      setAuthBusy(false);
    }
  }

  async function startTurn(userText: string) {
    const activeToken = token;
    if (!activeToken) return;
    const turn = createTurn(userText);
    const id = turn.id;
    setFeed((prev) => [...prev, { kind: "turn", turn }]);
    setBusy(true);
    busyRef.current = true;
    setStatus("Thinking…");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let sawContent = false;
    try {
      const opened = await openChatTurn({
        apiUrl: options.apiUrl,
        token: activeToken,
        message: userText,
        threadId: threadId || undefined,
        provider,
        model,
        signal: ctrl.signal,
      });
      if (opened.threadId) setThreadId(opened.threadId);
      for await (const evt of opened.events) {
        if (evt.type === "token") {
          sawContent = true;
          const chunk = evt.content;
          updateTurn(id, (t) => appendAnswer(t, chunk));
        } else if (evt.type === "tool_call") {
          const step = { tool: evt.tool, args: evt.args ?? {}, startedAt: Date.now() };
          updateTurn(id, (t) => ({ ...t, tools: [...t.tools, step] }));
          setStatus(`Running ${evt.tool}…`);
        } else if (evt.type === "tool_result") {
          const at = Date.now();
          updateTurn(id, (t) => {
            const tools = [...t.tools];
            for (let i = tools.length - 1; i >= 0; i--) {
              if (tools[i]!.output === undefined) {
                tools[i] = { ...tools[i]!, output: evt.output ?? "", elapsedMs: at - tools[i]!.startedAt };
                break;
              }
            }
            return { ...t, tools };
          });
          setStatus("Thinking…");
        } else if (evt.type === "error") {
          updateTurn(id, failTurn);
          pushSystem(evt.message);
          setStatus("Turn failed.");
        } else if (evt.type === "done") {
          updateTurn(id, completeTurnIfWorking);
          setStatus(queueRef.current.length > 0 ? "Sending queued message…" : "Ready.");
        }
      }
      if (!sawContent) {
        updateTurn(id, (t) =>
          t.answer === "" ? { ...t, answer: "(no reply — empty turn)" } : t,
        );
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        updateTurn(id, cancelTurn);
        pushSystem("Turn cancelled.");
        setStatus("Ready.");
      } else {
        updateTurn(id, failTurn);
        pushSystem(`that turn failed (${e instanceof Error ? e.message : String(e)}). Try rephrasing.`);
        setStatus("Turn failed.");
      }
    } finally {
      setBusy(false);
      busyRef.current = false;
      abortRef.current = null;
      const next = queueRef.current[0];
      if (next) {
        queueRef.current = queueRef.current.slice(1);
        setQueue(queueRef.current);
        setFeed((prev) => prev.filter((item) => !(item.kind === "queued" && item.id === next.id)));
        void startTurn(next.text);
      }
    }
  }

  async function handleSlash(raw: string) {
    const [cmd, ...rest] = raw.slice(1).split(/\s+/);
    const arg = rest.join(" ").trim();
    switch ((cmd ?? "").toLowerCase()) {
      case "help":
        pushSystem("/clear · /thread [id] · /threads · /provider [name] · /model [name] · /logout · /quit — esc cancels a turn");
        break;
      case "clear":
        if (!token) break;
        if (!threadId) {
          pushSystem("No thread yet — send a message first, then /clear.");
          break;
        }
        try {
          await apiClearHistory(options.apiUrl, token, threadId);
          setFeed([]);
          pushSystem(`History cleared for thread ${threadId}.`);
        } catch (e) {
          pushSystem(e instanceof Error ? e.message : String(e));
        }
        break;
      case "thread":
        if (!arg) {
          pushSystem(threadId ? `Current thread: ${threadId}. Usage: /thread <id>` : "No thread yet — send a message first.");
        } else if (!isThreadId(arg)) {
          pushSystem(`Threads are numeric — use /threads to list, then /thread <id>.`);
        } else {
          setThreadId(arg);
          pushSystem(`Switched to thread ${arg}.`);
        }
        break;
      case "threads":
        if (!token) break;
        try {
          const rows = await apiListThreads(options.apiUrl, token);
          if (rows.length === 0) pushSystem("No threads yet.");
          else for (const r of rows) {
            pushSystem(`${r.thread_id} · ${r.title} (${r.message_count} msgs)${String(r.thread_id) === threadId ? " ← current" : ""}`);
          }
        } catch (e) {
          pushSystem(e instanceof Error ? e.message : String(e));
        }
        break;
      case "provider":
        if (!arg) pushSystem(`Provider: ${provider ?? "(server default)"}. Usage: /provider ollama|llamacpp|openrouter`);
        else {
          setProvider(arg);
          pushSystem(`Provider set to "${arg}".`);
        }
        break;
      case "model":
        if (!arg) pushSystem(`Model: ${model ?? "(server default)"}. Usage: /model <name>`);
        else {
          setModel(arg);
          pushSystem(`Model set to "${arg}".`);
        }
        break;
      case "logout":
        clearToken();
        setToken(null);
        setUsername("");
        setFeed([]);
        setThreadId("");
        setAuthError("");
        break;
      case "quit":
      case "exit":
        process.exit(0);
        break;
      default:
        pushSystem(`Unknown command "/${cmd}". Try /help.`);
        break;
    }
  }

  function clearInput() {
    if (inputRef.current) inputRef.current.value = "";
    setDraft("");
    setCompleteIdx(0);
  }

  function handleSubmit(value: string) {
    const text = value.trim();
    clearInput();
    if (!text || !token) return;
    if (text.startsWith("/")) {
      void handleSlash(text);
      return;
    }
    if (busyRef.current) {
      const id = nextQueueId();
      queueRef.current = [...queueRef.current, { id, text }];
      setQueue(queueRef.current);
      setFeed((prev) => [...prev, { kind: "queued", id, text }]);
      setStatus(`Working… · Queued (${queueRef.current.length})`);
      return;
    }
    void startTurn(text);
  }

  function toggleLastThinking() {
    setFeed((prev) => {
      let target = -1;
      for (let i = prev.length - 1; i >= 0; i--) {
        const item = prev[i]!;
        if (item.kind === "turn" && item.turn.tools.length > 0) {
          target = i;
          break;
        }
      }
      if (target < 0) return prev;
      return prev.map((item, i) =>
        item.kind === "turn" && i === target
          ? { ...item, turn: { ...item.turn, expanded: !item.turn.expanded } }
          : item,
      );
    });
  }

  // Slash completions: only while typing the command word itself.
  const completing = draft.startsWith("/") && !draft.slice(1).includes(" ");
  const matches = completing
    ? SLASH_COMMANDS.filter((c) => c.name.startsWith(draft.toLowerCase()))
    : [];
  const showPopup = completing && matches.length > 0;
  const activeMatch = matches[Math.min(completeIdx, Math.max(matches.length - 1, 0))];

  useKeyboard((key) => {
    if (!token) {
      if (key.name === "tab") {
        setAuthFocus((f) => (f === "tabs" ? "user" : f === "user" ? "pass" : "tabs"));
      }
      return;
    }
    if (key.name === "escape") {
      if (showPopup) {
        setDraft("");
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
      if (abortRef.current) {
        abortRef.current.abort();
        setStatus("Cancelling turn… (esc)");
      }
      return;
    }
    if (key.name === "tab" && showPopup && activeMatch) {
      const completed = `${activeMatch.name} `;
      if (inputRef.current) inputRef.current.value = completed;
      setDraft(completed);
      setCompleteIdx(0);
      return;
    }
    if ((key.name === "up" || key.name === "down") && showPopup) {
      setCompleteIdx((i) => {
        const n = matches.length;
        return key.name === "up" ? (i - 1 + n) % n : (i + 1) % n;
      });
      return;
    }
    if ((key.ctrl ?? false) && key.name === "t") {
      toggleLastThinking();
      return;
    }
    if (key.name === "pageup" || key.name === "page_up") {
      scrollRef.current?.scrollBy({ x: 0, y: -1 }, "viewport");
      return;
    }
    if (key.name === "pagedown" || key.name === "page_down") {
      scrollRef.current?.scrollBy({ x: 0, y: 1 }, "viewport");
    }
  });

  if (!token) {
    return (
      <box flexDirection="column" style={{ padding: 1, gap: 1 }}>
        <box border title="Todoist AI" borderStyle="rounded" style={{ padding: 1 }}>
          <text>
            <strong>Sign in</strong>
            <span fg="gray"> — backend {options.apiUrl} · ←/→ switch tab · tab next field · enter submits</span>
          </text>
        </box>
        {authError ? <text fg="red">{authError}</text> : null}
        <tab-select
          focused={authFocus === "tabs"}
          showDescription={false}
          options={[
            { name: "Login", description: "Sign in to an existing account" },
            { name: "Register", description: "Create a new account" },
          ]}
          onChange={(index: number) => {
            setAuthMode(index === 1 ? "register" : "login");
            setAuthError("");
          }}
          onSelect={() => setAuthFocus("user")}
        />
        <box title="Username" border style={{ height: 3 }}>
          <input
            placeholder="username"
            focused={authFocus === "user"}
            onInput={setAuthUser}
            onSubmit={() => setAuthFocus("pass")}
          />
        </box>
        <box title="Password" border style={{ height: 3 }}>
          <input
            placeholder="password"
            focused={authFocus === "pass"}
            onInput={setAuthPass}
            onSubmit={() => void doAuth()}
          />
        </box>
        <text fg="gray">{authBusy ? "Authenticating…" : authMode === "login" ? "Mode: login — switch tabs above for a new account" : "Mode: register — creates the account, then signs in"}</text>
      </box>
    );
  }

  const statusLine = copyFlash
    ? copyFlash
    : busy
      ? `Working…${queue.length > 0 ? ` · Queued (${queue.length})` : ""} (esc cancels)`
      : status;

  return (
    <box flexDirection="column" style={{ width, height }}>
      <box border borderStyle="single" style={{ paddingLeft: 1, paddingRight: 1 }}>
        <text>
          <strong fg="cyan">Todoist AI</strong>
          <span fg="gray"> · {username || "…"} · {provider ?? "default"}:{model ?? "default"} · thread {threadId || "…"}</span>
        </text>
      </box>

      <scrollbox
        ref={scrollRef}
        stickyScroll
        stickyStart="bottom"
        style={{ flexGrow: 1, paddingLeft: 1, paddingRight: 1 }}
      >
        <box flexDirection="column">
          {feed.map((item) =>
            item.kind === "turn" ? (
              <FeedView key={item.turn.id} item={item} now={now} />
            ) : (
              <FeedView key={item.id} item={item} now={now} />
            ),
          )}
        </box>
      </scrollbox>

      {showPopup ? (
        <box border title="Commands (tab completes · ↑↓ navigate · esc dismisses)" style={{ paddingLeft: 1 }}>
          <box flexDirection="column">
            {matches.map((c, i) => (
              <text key={c.name} fg={i === Math.min(completeIdx, matches.length - 1) ? "cyan" : undefined}>
                {i === Math.min(completeIdx, matches.length - 1) ? "› " : "  "}{c.usage} <span fg="gray">— {c.desc}</span>
              </text>
            ))}
          </box>
        </box>
      ) : null}

      {busy ? (
        <Spinner type="dots" label={statusLine} />
      ) : (
        <text fg="gray">{statusLine}</text>
      )}

      <box
        title={queue.length > 0 ? `Message — ${queue.length} queued` : "Message (/ for commands)"}
        border
        style={{ height: 3 }}
      >
        <input
          ref={inputRef}
          placeholder="Ask about todos…"
          focused
          onInput={(v: string) => {
            setDraft(v);
            setCompleteIdx(0);
          }}
          onSubmit={(v: unknown) => handleSubmit(submittedText(v))}
        />
      </box>
      <text fg="gray">
        enter send{busy ? " (queues)" : ""} · esc cancel · ctrl+t tools · pgup/pgdn scroll · drag text = copy · /quit exits
      </text>
    </box>
  );
}
