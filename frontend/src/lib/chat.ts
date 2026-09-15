// Chat wire protocol shared with the CLI (`cli/src/api.ts` + `cli/src/types.ts`).
//
// One backend ReAct loop (`backend/src/chat/service.py`), two clients: the CLI
// sends no capabilities and stays data-only; the web client advertises
// `ui_action` and applies those events locally (filters/view/highlight).
// Backend never mutates URLs or zustand directly — it emits intents.

import { API_BASE, getToken } from "@/lib/api";

export enum ClientKind {
    Web = "web",
    Cli = "cli",
}

export enum ClientCapability {
    UiAction = "ui_action",
}

export enum ChatEventType {
    Token = "token",
    ToolCall = "tool_call",
    ToolResult = "tool_result",
    UiData = "ui_data",
    AskUser = "ask_user",
    UiSuggestions = "ui_suggestions",
    UiAction = "ui_action",
    Done = "done",
    Error = "error",
}

export enum WidgetKind {
    TodoList = "todo_list",
}

export enum UiActionKind {
    SetFilter = "set_filter",
    SetView = "set_view",
    Highlight = "highlight",
}

/** Caps shared with `backend/src/chat/protocol.py` — keep values in sync. */
export const CHAT_MAX_SUGGESTIONS = 4;
export const CHAT_MAX_SUGGESTION_CHARS = 40;
export const CHAT_UI_DATA_MAX_ROWS = 30;
export const CHAT_HIGHLIGHT_MAX_IDS = 20;

export function parseUiActionKind(value: unknown): UiActionKind | null {
    switch (value) {
        case UiActionKind.SetFilter:
            return UiActionKind.SetFilter;
        case UiActionKind.SetView:
            return UiActionKind.SetView;
        case UiActionKind.Highlight:
            return UiActionKind.Highlight;
        default:
            return null;
    }
}

export type ChatEvent =
    | { type: "token"; content: string }
    | { type: "tool_call"; tool: string; args: Record<string, unknown> }
    | { type: "tool_result"; tool: string; output: string }
    | { type: "ui_data"; widget: TodoListWidgetData }
    | { type: "ask_user"; question: string; options?: string[] }
    | { type: "ui_suggestions"; suggestions: string[] }
    | { type: "ui_action"; action: UiActionKind; args: Record<string, unknown> }
    | { type: "done" }
    | { type: "error"; message: string };

export function isTokenEvent(evt: ChatEvent): evt is Extract<ChatEvent, { type: "token" }> {
    return evt.type === ChatEventType.Token;
}

export function isUiActionEvent(evt: ChatEvent): evt is Extract<ChatEvent, { type: "ui_action" }> {
    return evt.type === ChatEventType.UiAction;
}

/** Point-in-time snapshot of a listing for widget rendering. Counts cover
 * the full result set; `todos` may be truncated (see `truncated`/`total`). */
export interface WidgetTodo {
    id: number;
    task: string;
    completed: boolean;
    todo_date: string;
}

export interface TodoListWidgetData {
    kind: WidgetKind.TodoList;
    open: number;
    done: number;
    total: number;
    truncated: boolean;
    todos: WidgetTodo[];
}

export type AssistantWidget = TodoListWidgetData;

/** Flip a single row inside a snapshot widget, adjusting open/done counts
 * by delta (counts cover the full result set, `todos` may be truncated,
 * so they can't be recomputed from the visible rows). No-op when the id
 * is absent or already has the target state. */
export function setWidgetTodoCompleted(widget: AssistantWidget, id: number, completed: boolean): AssistantWidget {
    switch (widget.kind) {
        case WidgetKind.TodoList: {
            const prev = widget.todos.find((t) => t.id === id);
            if (!prev || prev.completed === completed) return widget;
            const delta = completed ? 1 : -1;
            return {
                ...widget,
                open: widget.open - delta,
                done: widget.done + delta,
                todos: widget.todos.map((t) => (t.id === id ? { ...t, completed } : t)),
            };
        }
        default: {
            return widget;
        }
    }
}

function parseWidgetTodo(value: unknown): WidgetTodo | null {
    if (typeof value !== "object" || value === null) return null;
    const row = value as Record<string, unknown>;
    if (typeof row["id"] !== "number" || !Number.isInteger(row["id"])) return null;
    if (typeof row["task"] !== "string") return null;
    if (typeof row["completed"] !== "boolean") return null;
    if (typeof row["todo_date"] !== "string") return null;
    return { id: row["id"], task: row["task"], completed: row["completed"], todo_date: row["todo_date"] };
}

function parseTodoListWidget(raw: Record<string, unknown>): TodoListWidgetData | null {
    if (raw["widget"] !== WidgetKind.TodoList) return null;
    if (!Array.isArray(raw["todos"])) return null;
    const todos: WidgetTodo[] = [];
    for (const item of raw["todos"]) {
        const parsed = parseWidgetTodo(item);
        if (!parsed) return null;
        todos.push(parsed);
    }
    if (typeof raw["open"] !== "number" || typeof raw["done"] !== "number") return null;
    return {
        kind: WidgetKind.TodoList,
        open: raw["open"],
        done: raw["done"],
        total: typeof raw["total"] === "number" ? raw["total"] : todos.length,
        truncated: raw["truncated"] === true,
        todos: todos.slice(0, CHAT_UI_DATA_MAX_ROWS),
    };
}

export interface ChatClientInfo {
    kind: ClientKind.Web;
    capabilities: ClientCapability[];
    ui_state?: Record<string, unknown>;
}

/** Typed shapes of `ui_action` args (backend tool schemas). The sidebar
 * narrows the opaque record to these before applying. */
export interface SetFilterActionArgs {
    status?: unknown;
    date_preset?: unknown;
    start_date?: unknown;
    end_date?: unknown;
    archived?: unknown;
}

export interface SetViewActionArgs {
    view?: unknown;
    sort?: unknown;
    density?: unknown;
}

export interface HighlightActionArgs {
    ids?: unknown;
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
    const token = getToken();
    if (!token) throw new Error("Not authenticated — please log in again.");
    const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
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
            yield { type: "error", message: `chat request failed (${res.status}): ${text.slice(0, 300)}` };
            return;
        }
        yield* readSse(res.body);
    }

    return { threadId: resolvedThread, events: events() };
}

/** Yield typed SSE events (`data: {...}` frames). Unknown `ui_action`
 * kinds and malformed `ui_data` widgets are dropped here so the UI
 * switch stays exhaustive. */
async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<ChatEvent> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            let sep: number;
            while ((sep = buf.indexOf("\n\n")) >= 0) {
                const frame = buf.slice(0, sep);
                buf = buf.slice(sep + 2);
                for (const line of frame.split("\n")) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith("data:")) continue;
                    const payload = trimmed.slice(5).trim();
                    if (!payload) continue;
                    try {
                        const raw = JSON.parse(payload) as Record<string, unknown>;
                        const evt = normalizeEvent(raw);
                        if (evt) yield evt;
                    } catch {
                        // skip malformed frame
                    }
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
}

function normalizeEvent(raw: Record<string, unknown>): ChatEvent | null {
    switch (raw["type"]) {
        case ChatEventType.Token:
            return typeof raw["content"] === "string" ? { type: "token", content: raw["content"] } : null;
        case ChatEventType.ToolCall:
            return typeof raw["tool"] === "string"
                ? { type: "tool_call", tool: raw["tool"], args: asRecord(raw["args"]) }
                : null;
        case ChatEventType.ToolResult:
            return typeof raw["tool"] === "string"
                ? { type: "tool_result", tool: raw["tool"], output: String(raw["output"] ?? "") }
                : null;
        case ChatEventType.AskUser:
            return typeof raw["question"] === "string"
                ? {
                      type: "ask_user",
                      question: raw["question"],
                      options: Array.isArray(raw["options"])
                          ? raw["options"].filter((o): o is string => typeof o === "string")
                          : [],
                  }
                : null;
        case ChatEventType.UiData: {
            const widget = parseTodoListWidget(raw);
            return widget ? { type: "ui_data", widget } : null;
        }
        case ChatEventType.UiSuggestions: {
            if (!Array.isArray(raw["suggestions"])) return null;
            const suggestions = raw["suggestions"]
                .filter((s): s is string => typeof s === "string")
                .map((s) => s.trim().slice(0, CHAT_MAX_SUGGESTION_CHARS))
                .filter((s) => s.length > 0)
                .slice(0, CHAT_MAX_SUGGESTIONS);
            return suggestions.length > 0 ? { type: "ui_suggestions", suggestions } : null;
        }
        case ChatEventType.UiAction: {
            const action = parseUiActionKind(raw["action"]);
            return action ? { type: "ui_action", action, args: asRecord(raw["args"]) } : null;
        }
        case ChatEventType.Done:
            return { type: "done" };
        case ChatEventType.Error:
            return { type: "error", message: String(raw["message"] ?? "chat turn failed") };
        default:
            return null;
    }
}

function asRecord(value: unknown): Record<string, unknown> {
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}
