// Turn orchestration for the web assistant: SSE loop, abort, submit.
// Plain module functions over the zustand stores — no hook instance, so the
// drawer (or any future surface) can submit or cancel without prop drilling.
// Mirrors `cli/src/lib/chat-turn.ts`; the web-only difference is the
// `ui_action` branch, applied locally via the injected `applyUiAction`.

import { openChatTurn, UiActionKind, type ChatClientInfo } from "@/lib/chat";
import { resolveAssistantPick, useAssistantStore } from "@/stores/assistant-store";

export interface AssistantTurnContext {
    /** Snapshot of current view/filter state for the prompt (`ui_state`). */
    getUiState: () => Record<string, unknown>;
    /** Apply a validated `ui_action` locally; returns a one-line summary. */
    applyUiAction: (action: UiActionKind, args: Record<string, unknown>) => string;
}

let abortController: AbortController | null = null;

export async function startAssistantTurn(userText: string, ctx: AssistantTurnContext): Promise<void> {
    const store = useAssistantStore.getState();
    if (store.busy) return;
    const resolved = resolveAssistantPick(store.messages, userText);
    store.pushUser(resolved);
    const assistantId = store.pushAssistantPlaceholder();
    const chat = useAssistantStore.getState();
    chat.setBusy(true);
    chat.setStatus("Thinking…");
    const ctrl = new AbortController();
    abortController = ctrl;
    let sawContent = false;
    let sawAsk = false;
    try {
        const client: ChatClientInfo = { kind: "web", capabilities: ["ui_action"], ui_state: ctx.getUiState() };
        const opened = await openChatTurn({
            message: resolved,
            threadId: useAssistantStore.getState().threadId ?? undefined,
            client,
            signal: ctrl.signal,
        });
        if (opened.threadId) useAssistantStore.getState().setThreadId(opened.threadId);
        for await (const evt of opened.events) {
            const s = useAssistantStore.getState();
            switch (evt.type) {
                case "token":
                    sawContent = true;
                    s.appendAssistantText(assistantId, evt.content);
                    break;
                case "tool_call":
                    sawContent = true;
                    s.addToolCall(assistantId, evt.tool, evt.args);
                    s.setStatus(`Running ${evt.tool}…`);
                    break;
                case "tool_result":
                    s.setToolResult(assistantId, evt.tool, evt.output);
                    s.setStatus("Thinking…");
                    break;
                case "ui_data":
                    sawContent = true;
                    s.addWidget(assistantId, evt.widget);
                    break;
                case "ui_suggestions":
                    sawContent = true;
                    s.addSuggestions(assistantId, evt.suggestions);
                    break;
                case "ask_user": {
                    sawContent = true;
                    sawAsk = true;
                    const question =
                        typeof evt.question === "string" && evt.question.trim() ? evt.question : "Could you clarify?";
                    const options = Array.isArray(evt.options) ? evt.options.filter((o) => typeof o === "string") : [];
                    s.setClarification(assistantId, question, options);
                    s.setStatus("Waiting for your answer…");
                    break;
                }
                case "ui_action": {
                    sawContent = true;
                    try {
                        const summary = ctx.applyUiAction(evt.action, evt.args);
                        s.addUiNotice(assistantId, { action: evt.action, summary });
                    } catch (e) {
                        const detail = e instanceof Error ? e.message : String(e);
                        s.addUiNotice(assistantId, {
                            action: evt.action,
                            summary: `Couldn't apply view change (${detail})`,
                        });
                    }
                    break;
                }
                case "error":
                    s.appendAssistantText(assistantId, `That turn failed (${evt.message}). Try rephrasing.`);
                    s.setStatus("Turn failed.");
                    break;
                case "done":
                    s.setStatus(sawAsk ? "Waiting for your answer…" : "Ready.");
                    break;
            }
        }
        if (!sawContent) {
            const current = useAssistantStore.getState().messages.find((m) => m.id === assistantId);
            if (current && current.text === "" && current.widgets.length === 0) {
                useAssistantStore.getState().appendAssistantText(assistantId, "(no reply — empty turn)");
            }
        }
    } catch (e) {
        const s = useAssistantStore.getState();
        if (e instanceof DOMException && e.name === "AbortError") {
            s.appendAssistantText(assistantId, "Turn cancelled.");
            s.setStatus("Ready.");
        } else {
            const message = e instanceof Error ? e.message : String(e);
            s.appendAssistantText(assistantId, `That turn failed (${message}). Try rephrasing.`);
            s.setStatus("Turn failed.");
        }
    } finally {
        useAssistantStore.getState().setBusy(false);
        abortController = null;
    }
}

export function submitAssistantText(text: string, ctx: AssistantTurnContext): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (useAssistantStore.getState().busy) return;
    void startAssistantTurn(trimmed, ctx);
}

export function cancelAssistantTurn(): void {
    abortController?.abort();
}

export function isAssistantRunning(): boolean {
    return abortController !== null;
}
