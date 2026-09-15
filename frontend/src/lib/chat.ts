// Chat transport shared with the CLI (`cli/src/api.ts` + `cli/src/types.ts`).
//
// One backend ReAct loop (`backend/src/chat/service.py`), two clients: the CLI
// sends no capabilities and stays data-only; the web client advertises
// `ui_action` and applies those events locally (filters/view/highlight).
// Backend never mutates URLs or zustand directly — it emits intents.
//
// Protocol types live in `lib/chat-protocol.ts` (re-exported here so existing
// `@/lib/chat` import sites keep working). Parsing lives in
// `lib/chat-events.ts`, SSE framing in `lib/sse.ts`.

import { API_BASE, authHeader } from "@/lib/api";
import { normalizeEvent } from "@/lib/chat-events";
import { readSseRaw } from "@/lib/sse";
import { ChatEventType, type ChatEvent, type ChatClientInfo } from "@/lib/chat-protocol";

export {
    CHAT_HIGHLIGHT_MAX_IDS,
    CHAT_MAX_SUGGESTIONS,
    CHAT_MAX_SUGGESTION_CHARS,
    CHAT_UI_DATA_MAX_ROWS,
    ChatEventType,
    ClientCapability,
    ClientKind,
    parseUiActionKind,
    setWidgetTodoCompleted,
    UiActionKind,
    WidgetKind,
    type AssistantWidget,
    type ChatClientInfo,
    type ChatEvent,
    type HighlightActionArgs,
    type SetFilterActionArgs,
    type SetViewActionArgs,
    type TodoListWidgetData,
    type WidgetTodo,
} from "@/lib/chat-protocol";

export function isTokenEvent(evt: ChatEvent): evt is Extract<ChatEvent, { type: ChatEventType.Token }> {
    return evt.type === ChatEventType.Token;
}

export function isUiActionEvent(evt: ChatEvent): evt is Extract<ChatEvent, { type: ChatEventType.UiAction }> {
    return evt.type === ChatEventType.UiAction;
}

export interface TurnParams {
    message: string;
    threadId?: string;
    client?: ChatClientInfo;
    signal?: AbortSignal;
}

/** Open a turn: POSTs and returns the resolved numeric thread id
 * (X-Chat-Thread-Id) plus the SSE event stream. */
export async function openChatTurn(params: TurnParams): Promise<{
    threadId: string | null;
    events: AsyncGenerator<ChatEvent>;
}> {
    const headers = authHeader();
    if (!headers.Authorization) throw new Error("Not authenticated — please log in again.");
    const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: {
            ...headers,
            "Content-Type": "application/json",
            Accept: "text/event-stream",
        },
        body: JSON.stringify({
            message: params.message,
            ...(params.threadId ? { thread_id: params.threadId } : {}),
            ...(params.client ? { client: params.client } : {}),
        }),
        signal: params.signal,
    });
    const resolvedThread = res.headers.get("X-Chat-Thread-Id");

    async function* events(): AsyncGenerator<ChatEvent> {
        if (!res.ok || !res.body) {
            const text = await res.text().catch(() => "");
            yield {
                type: ChatEventType.Error,
                message: `chat request failed (${res.status}): ${text.slice(0, 300)}`,
            };
            return;
        }
        for await (const raw of readSseRaw(res.body)) {
            const evt = normalizeEvent(raw);
            if (evt) yield evt;
        }
    }

    return { threadId: resolvedThread, events: events() };
}
