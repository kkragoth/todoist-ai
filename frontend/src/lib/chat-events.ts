// Typed parsing for chat SSE payloads. Unknown `ui_action` kinds and
// malformed `ui_data` widgets are dropped here so UI switches stay exhaustive.

import {
    CHAT_MAX_SUGGESTIONS,
    CHAT_MAX_SUGGESTION_CHARS,
    CHAT_UI_DATA_MAX_ROWS,
    ChatEventType,
    parseUiActionKind,
    WidgetKind,
    type ChatEvent,
    type TodoListWidgetData,
    type WidgetTodo,
} from "@/lib/chat-protocol";

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

function asRecord(value: unknown): Record<string, unknown> {
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

export function normalizeEvent(raw: Record<string, unknown>): ChatEvent | null {
    switch (raw["type"]) {
        case ChatEventType.Token:
            return typeof raw["content"] === "string" ? { type: ChatEventType.Token, content: raw["content"] } : null;
        case ChatEventType.ToolCall:
            return typeof raw["tool"] === "string"
                ? { type: ChatEventType.ToolCall, tool: raw["tool"], args: asRecord(raw["args"]) }
                : null;
        case ChatEventType.ToolResult:
            return typeof raw["tool"] === "string"
                ? {
                      type: ChatEventType.ToolResult,
                      tool: raw["tool"],
                      output: String(raw["output"] ?? ""),
                  }
                : null;
        case ChatEventType.AskUser:
            return typeof raw["question"] === "string"
                ? {
                      type: ChatEventType.AskUser,
                      question: raw["question"],
                      options: Array.isArray(raw["options"])
                          ? raw["options"].filter((o): o is string => typeof o === "string")
                          : [],
                  }
                : null;
        case ChatEventType.UiData: {
            const widget = parseTodoListWidget(raw);
            return widget ? { type: ChatEventType.UiData, widget } : null;
        }
        case ChatEventType.UiSuggestions: {
            if (!Array.isArray(raw["suggestions"])) return null;
            const suggestions = raw["suggestions"]
                .filter((s): s is string => typeof s === "string")
                .map((s) => s.trim().slice(0, CHAT_MAX_SUGGESTION_CHARS))
                .filter((s) => s.length > 0)
                .slice(0, CHAT_MAX_SUGGESTIONS);
            return suggestions.length > 0 ? { type: ChatEventType.UiSuggestions, suggestions } : null;
        }
        case ChatEventType.UiAction: {
            const action = parseUiActionKind(raw["action"]);
            return action ? { type: ChatEventType.UiAction, action, args: asRecord(raw["args"]) } : null;
        }
        case ChatEventType.Done:
            return { type: ChatEventType.Done };
        case ChatEventType.Error:
            return { type: ChatEventType.Error, message: String(raw["message"] ?? "chat turn failed") };
        default:
            return null;
    }
}
