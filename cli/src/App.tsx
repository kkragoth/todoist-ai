import { useEffect, useRef, useState } from "react";
import type { InputRenderable, ScrollBoxRenderable } from "@opentui/core";
import { useKeyboard, useRenderer, useSelectionHandler, useTerminalDimensions } from "@opentui/react";
import { FeedView } from "@/components/feed-view.js";
import { Spinner } from "@/components/ui/spinner.js";
import { useAuth } from "@/hooks/use-auth.js";
import { useChatTurn } from "@/hooks/use-chat-turn.js";
import { useSlashCommands } from "@/hooks/use-slash.js";
import { submittedText } from "@/lib/text.js";
import { useChatStore } from "@/stores/chat-store.js";
import { useSessionStore } from "@/stores/session-store.js";
import { AuthFocus, AuthMode, nextAuthFocus } from "@/types.js";
import { SLASH_COMMANDS } from "@/types.js";

/** Thin composition: global state lives in zustand stores, turn/auth/slash
 * logic in hooks. This component owns only view-local state (draft, timers,
 * refs) plus layout and keyboard wiring. */
export function App() {
    const renderer = useRenderer();
    const { width, height } = useTerminalDimensions();

    const token = useSessionStore((s) => s.token);
    const username = useSessionStore((s) => s.username);
    const threadId = useSessionStore((s) => s.threadId);
    const provider = useSessionStore((s) => s.provider);
    const model = useSessionStore((s) => s.model);
    const apiUrl = useSessionStore((s) => s.apiUrl);

    const feed = useChatStore((s) => s.feed);
    const busy = useChatStore((s) => s.busy);
    const status = useChatStore((s) => s.status);
    const queue = useChatStore((s) => s.queue);
    const setStatus = useChatStore((s) => s.setStatus);
    const toggleLastThinking = useChatStore((s) => s.toggleLastThinking);

    const auth = useAuth();
    const { submitText, cancel, isRunning } = useChatTurn();
    const handleSlash = useSlashCommands({ onLogout: auth.reset });

    const [draft, setDraft] = useState("");
    const [completeIdx, setCompleteIdx] = useState(0);
    const [now, setNow] = useState(() => Date.now());
    const [copyFlash, setCopyFlash] = useState("");

    const inputRef = useRef<InputRenderable>(null);
    const scrollRef = useRef<ScrollBoxRenderable>(null);
    const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    // Tick elapsed timers while a turn is in flight.
    useEffect(() => {
        if (!busy) return;
        const t = setInterval(() => setNow(Date.now()), 100);
        return () => clearInterval(t);
    }, [busy]);

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
        submitText(text);
    }

    // Slash completions: only while typing the command word itself.
    const completing = draft.startsWith("/") && !draft.slice(1).includes(" ");
    const matches = completing ? SLASH_COMMANDS.filter((c) => c.name.startsWith(draft.toLowerCase())) : [];
    const showPopup = completing && matches.length > 0;
    const activeMatch = matches[Math.min(completeIdx, Math.max(matches.length - 1, 0))];

    useKeyboard((key) => {
        if (!token) {
            if (key.name === "tab") {
                auth.setFocus(nextAuthFocus(auth.focus));
            }
            return;
        }
        if (key.name === "escape") {
            if (showPopup) {
                setDraft("");
                if (inputRef.current) inputRef.current.value = "";
                return;
            }
            if (isRunning()) {
                cancel();
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
                        <span fg="gray"> — backend {apiUrl} · ←/→ switch tab · tab next field · enter submits</span>
                    </text>
                </box>
                {auth.error && <text fg="red">{auth.error}</text>}
                <tab-select
                    focused={auth.focus === AuthFocus.Tabs}
                    showDescription={false}
                    options={[
                        { name: "Login", description: "Sign in to an existing account" },
                        { name: "Register", description: "Create a new account" },
                    ]}
                    onChange={(index: number) => {
                        auth.setMode(index === 1 ? AuthMode.Register : AuthMode.Login);
                        auth.setError("");
                    }}
                    onSelect={() => auth.setFocus(AuthFocus.User)}
                />
                <box title="Username" border style={{ height: 3 }}>
                    <input
                        placeholder="username"
                        focused={auth.focus === AuthFocus.User}
                        onInput={auth.setUser}
                        onSubmit={() => auth.setFocus(AuthFocus.Pass)}
                    />
                </box>
                <box title="Password" border style={{ height: 3 }}>
                    <input
                        placeholder="password"
                        focused={auth.focus === AuthFocus.Pass}
                        onInput={auth.setPass}
                        onSubmit={() => void auth.doAuth()}
                    />
                </box>
                <text fg="gray">
                    {auth.busy
                        ? "Authenticating…"
                        : auth.mode === AuthMode.Login
                          ? "Mode: login — switch tabs above for a new account"
                          : "Mode: register — creates the account, then signs in"}
                </text>
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
                    <span fg="gray">
                        {" "}
                        · {username || "…"} · {provider ?? "default"}:{model ?? "default"} · thread {threadId || "…"}
                    </span>
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

            {showPopup && (
                <box border title="Commands (tab completes · ↑↓ navigate · esc dismisses)" style={{ paddingLeft: 1 }}>
                    <box flexDirection="column">
                        {matches.map((c, i) => (
                            <text
                                key={c.name}
                                fg={i === Math.min(completeIdx, matches.length - 1) ? "cyan" : undefined}
                            >
                                {i === Math.min(completeIdx, matches.length - 1) ? "› " : "  "}
                                {c.usage} <span fg="gray">— {c.desc}</span>
                            </text>
                        ))}
                    </box>
                </box>
            )}

            {busy ? <Spinner type="dots" label={statusLine} /> : <text fg="gray">{statusLine}</text>}

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
                enter send{busy ? " (queues)" : ""} · esc cancel · ctrl+t tools · pgup/pgdn scroll · drag text = copy ·
                /quit exits
            </text>
        </box>
    );
}
