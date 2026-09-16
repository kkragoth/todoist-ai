import { openChatTurn } from "@/api.js";
import { ConnectionStatus } from "@/lib/connection.js";
import { resolveSessionToken } from "@/lib/oauth-provider.js";
import {
    appendAnswer,
    cancelTurn,
    completeTurnIfWorking,
    createTurn,
    failTurn,
    resolveClarificationPick,
    setClarification,
} from "@/lib/turn.js";
import { useChatStore } from "@/stores/chat-store.js";
import { useSessionStore } from "@/stores/session-store.js";

/** Turn orchestration: SSE loop, abort, and queue-or-start submit.
 * Plain module functions over the zustand stores — no hook instance, so any
 * component can submit or cancel without prop drilling. The busy/queue state
 * lives in the store, so no ref mirrors are needed for sync reads. */
let abortController: AbortController | null = null;

export async function startTurn(userText: string): Promise<void> {
    const session = useSessionStore.getState();
    const chat = useChatStore.getState();
    // OAuth access tokens expire: refresh transparently when possible.
    const activeToken = await resolveSessionToken(session.apiUrl, session.token);
    if (activeToken && activeToken !== session.token) session.setToken(activeToken);
    if (!activeToken) return;
    const turn = createTurn(userText);
    const id = turn.id;
    chat.pushTurn(turn);
    chat.markClarificationsAnswered(id);
    chat.setBusy(true);
    chat.setStatus("Thinking…");
    const ctrl = new AbortController();
    abortController = ctrl;
    let sawContent = false;
    let sawAsk = false;
    try {
        const opened = await openChatTurn({
            apiUrl: session.apiUrl,
            token: activeToken,
            message: userText,
            threadId: session.threadId || undefined,
            provider: session.provider,
            model: session.model,
            signal: ctrl.signal,
        });
        if (opened.threadId) session.setThreadId(opened.threadId);
        session.setConnection(ConnectionStatus.Connected);
        for await (const evt of opened.events) {
            if (evt.type === "token") {
                sawContent = true;
                const chunk = evt.content;
                chat.updateTurn(id, (t) => appendAnswer(t, chunk));
            } else if (evt.type === "tool_call") {
                const step = { tool: evt.tool, args: evt.args ?? {}, startedAt: Date.now() };
                chat.updateTurn(id, (t) => ({ ...t, tools: [...t.tools, step] }));
                chat.setStatus(`Running ${evt.tool}…`);
            } else if (evt.type === "tool_result") {
                const at = Date.now();
                chat.updateTurn(id, (t) => {
                    const tools = [...t.tools];
                    for (let i = tools.length - 1; i >= 0; i--) {
                        if (tools[i]!.output === undefined) {
                            tools[i] = {
                                ...tools[i]!,
                                output: evt.output ?? "",
                                elapsedMs: at - tools[i]!.startedAt,
                            };
                            break;
                        }
                    }
                    return { ...t, tools };
                });
                chat.setStatus("Thinking…");
            } else if (evt.type === "ask_user") {
                sawContent = true;
                sawAsk = true;
                const question =
                    typeof evt.question === "string" && evt.question.trim() ? evt.question : "Could you clarify?";
                const options = Array.isArray(evt.options) ? evt.options.filter((o) => typeof o === "string") : [];
                chat.updateTurn(id, (t) => setClarification(t, question, options));
                chat.setStatus("Waiting for your answer…");
            } else if (evt.type === "error") {
                chat.updateTurn(id, failTurn);
                chat.pushSystem(evt.message);
                chat.setStatus("Turn failed.");
            } else if (evt.type === "done") {
                chat.updateTurn(id, completeTurnIfWorking);
                const queued = useChatStore.getState().queue.length;
                chat.setStatus(queued > 0 ? "Sending queued message…" : sawAsk ? "Waiting for your answer…" : "Ready.");
            }
        }
        if (!sawContent) {
            chat.updateTurn(id, (t) => (t.answer === "" ? { ...t, answer: "(no reply — empty turn)" } : t));
        }
    } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
            chat.updateTurn(id, cancelTurn);
            chat.pushSystem("Turn cancelled.");
            chat.setStatus("Ready.");
        } else {
            const message = e instanceof Error ? e.message : String(e);
            if (
                message.includes("fetch failed") ||
                message.includes("fetch") ||
                message.includes("unreachable") ||
                message.includes("ECONNREFUSED") ||
                message.includes("Network")
            ) {
                session.setConnection(ConnectionStatus.Disconnected);
            }
            chat.updateTurn(id, failTurn);
            chat.pushSystem(`that turn failed (${message}). Try rephrasing.`);
            chat.setStatus("Turn failed.");
        }
    } finally {
        chat.setBusy(false);
        abortController = null;
        const next = chat.takeNextQueued();
        if (next) {
            // Re-resolve against the fresh feed: a digit queued before the
            // ask_user event arrived still picks the right option.
            const fresh = useChatStore.getState();
            void startTurn(resolveClarificationPick(fresh.feed, next.text));
        }
    }
}

export function submitChatText(text: string): void {
    const chat = useChatStore.getState();
    const resolved = resolveClarificationPick(chat.feed, text);
    if (chat.busy) {
        chat.enqueue(resolved);
        return;
    }
    void startTurn(resolved);
}

export function cancelTurnRequest(): void {
    abortController?.abort();
}

export function isTurnRunning(): boolean {
    return abortController !== null;
}
