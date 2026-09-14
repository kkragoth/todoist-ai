// Chat wire protocol shared with the CLI (`cli/src/api.ts` + `cli/src/types.ts`).
//
// One backend ReAct loop (`backend/src/chat/service.py`), two clients: the CLI
// sends no capabilities and stays data-only; the web client advertises
// `ui_action` and applies those events locally (filters/view/highlight).
// Backend never mutates URLs or zustand directly — it emits intents.

import { API_BASE, getToken } from "@/lib/api";

export enum UiActionKind {
    SetFilter = "set_filter",
    SetView = "set_view",
    Highlight = "highlight",
}

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
    return evt.type === "token";
}

export function isUiActionEvent(evt: ChatEvent): evt is Extract<ChatEvent, { type: "ui_action" }> {
    return evt.type === "ui_action";
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
    kind: "todo_list";
    open: number;
    done: number;
    total: number;
    truncated: boolean;
    todos: WidgetTodo[];
}

export type AssistantWidget = TodoListWidgetData;

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
    if (raw["widget"] !== "todo_list") return null;
    if (!Array.isArray(raw["todos"])) return null;
    const todos: WidgetTodo[] = [];
    for (const item of raw["todos"]) {
        const parsed = parseWidgetTodo(item);
        if (!parsed) return null;
        todos.push(parsed);
    }
    if (typeof raw["open"] !== "number" || typeof raw["done"] !== "number") return null;
    return {
        kind: "todo_list",
        open: raw["open"],
        done: raw["done"],
        total: typeof raw["total"] === "number" ? raw["total"] : todos.length,
        truncated: raw["truncated"] === true,
        todos: todos.slice(0, 30),
    };
}

export interface ChatClientInfo {
    kind: "web";
    capabilities: string[];
    ui_state?: Record<string, unknown>;
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
        case "token":
            return typeof raw["content"] === "string" ? { type: "token", content: raw["content"] } : null;
        case "tool_call":
            return typeof raw["tool"] === "string"
                ? { type: "tool_call", tool: raw["tool"], args: asRecord(raw["args"]) }
                : null;
        case "tool_result":
            return typeof raw["tool"] === "string"
                ? { type: "tool_result", tool: raw["tool"], output: String(raw["output"] ?? "") }
                : null;
        case "ask_user":
            return typeof raw["question"] === "string"
                ? {
                      type: "ask_user",
                      question: raw["question"],
                      options: Array.isArray(raw["options"])
                          ? raw["options"].filter((o): o is string => typeof o === "string")
                          : [],
                  }
                : null;
        case "ui_data": {
            const widget = parseTodoListWidget(raw);
            return widget ? { type: "ui_data", widget } : null;
        }
        case "ui_suggestions": {
            if (!Array.isArray(raw["suggestions"])) return null;
            const suggestions = raw["suggestions"]
                .filter((s): s is string => typeof s === "string")
                .map((s) => s.trim().slice(0, 40))
                .filter((s) => s.length > 0)
                .slice(0, 4);
            return suggestions.length > 0 ? { type: "ui_suggestions", suggestions } : null;
        }
        case "ui_action": {
            const action = parseUiActionKind(raw["action"]);
            return action ? { type: "ui_action", action, args: asRecord(raw["args"]) } : null;
        }
        case "done":
            return { type: "done" };
        case "error":
            return { type: "error", message: String(raw["message"] ?? "chat turn failed") };
        default:
            return null;
    }
}

function asRecord(value: unknown): Record<string, unknown> {
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}
