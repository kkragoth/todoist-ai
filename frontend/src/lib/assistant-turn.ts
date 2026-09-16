// Turn orchestration for the web assistant: SSE loop, abort, submit.
// Plain module functions over the zustand stores — no hook instance, so the
// drawer (or any future surface) can submit or cancel without prop drilling.
// Mirrors `cli/src/lib/chat-turn.ts`; the web-only difference is the
// `ui_action` branch, applied locally via the injected `applyUiAction`.

import {
    ChatEventType,
    ClientCapability,
    ClientKind,
    openChatTurn,
    UiActionKind,
    type ChatClientInfo,
} from "@/lib/chat";
import {
    AssistantStatus,
    resolveAssistantPick,
    runningStatus,
    turnFailedStatus,
    useAssistantStore,
} from "@/stores/assistant-store";

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
    chat.setStatus(AssistantStatus.Thinking);
    const ctrl = new AbortController();
    abortController = ctrl;
    let sawContent = false;
    let sawAsk = false;
    try {
        const client: ChatClientInfo = {
            kind: ClientKind.Web,
            capabilities: [ClientCapability.UiAction],
            ui_state: ctx.getUiState(),
        };
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
                case ChatEventType.Token:
                    sawContent = true;
                    s.appendAssistantText(assistantId, evt.content);
                    break;
                case ChatEventType.ToolCall:
                    sawContent = true;
                    s.addToolCall(assistantId, evt.tool, evt.args);
                    s.setStatus(runningStatus(evt.tool));
                    break;
                case ChatEventType.ToolResult:
                    s.setToolResult(assistantId, evt.tool, evt.output);
                    s.setStatus(AssistantStatus.Thinking);
                    break;
                case ChatEventType.UiData:
                    sawContent = true;
                    s.addWidget(assistantId, evt.widget);
                    break;
                case ChatEventType.UiSuggestions:
                    sawContent = true;
                    s.addSuggestions(assistantId, evt.suggestions);
                    break;
                case ChatEventType.AskUser: {
                    sawContent = true;
                    sawAsk = true;
                    const question =
                        typeof evt.question === "string" && evt.question.trim() ? evt.question : "Could you clarify?";
                    const options = Array.isArray(evt.options) ? evt.options.filter((o) => typeof o === "string") : [];
                    s.setClarification(assistantId, question, options);
                    s.setStatus(AssistantStatus.Waiting);
                    break;
                }
                case ChatEventType.UiAction: {
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
                case ChatEventType.Error:
                    s.appendAssistantText(assistantId, turnFailedStatus(evt.message));
                    s.setStatus(AssistantStatus.Failed);
                    break;
                case ChatEventType.Done:
                    s.setStatus(sawAsk ? AssistantStatus.Waiting : AssistantStatus.Ready);
                    break;
                default: {
                    const _exhaustive: never = evt;
                    void _exhaustive;
                    break;
                }
            }
        }
        if (!sawContent) {
            const current = useAssistantStore.getState().messages.find((m) => m.id === assistantId);
            if (current && current.text === "" && current.widgets.length === 0) {
                useAssistantStore.getState().appendAssistantText(assistantId, AssistantStatus.Empty);
            }
        }
    } catch (e) {
        const s = useAssistantStore.getState();
        if (e instanceof DOMException && e.name === "AbortError") {
            s.appendAssistantText(assistantId, AssistantStatus.Cancelled);
            s.setStatus(AssistantStatus.Ready);
        } else {
            const message = e instanceof Error ? e.message : String(e);
            s.appendAssistantText(assistantId, turnFailedStatus(message));
            s.setStatus(AssistantStatus.Failed);
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
