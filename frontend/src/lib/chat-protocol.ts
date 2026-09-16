// Chat wire-protocol types shared by `lib/chat.ts` (fetch/SSE) and
// `lib/chat-events.ts` (typed parsing). Split out so the parser and the
// transport don't import each other.

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
    | { type: ChatEventType.Token; content: string }
    | { type: ChatEventType.ToolCall; tool: string; args: Record<string, unknown> }
    | { type: ChatEventType.ToolResult; tool: string; output: string }
    | { type: ChatEventType.UiData; widget: TodoListWidgetData }
    | { type: ChatEventType.AskUser; question: string; options?: string[] }
    | { type: ChatEventType.UiSuggestions; suggestions: string[] }
    | { type: ChatEventType.UiAction; action: UiActionKind; args: Record<string, unknown> }
    | { type: ChatEventType.Done }
    | { type: ChatEventType.Error; message: string };

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

export interface ChatClientInfo {
    kind: ClientKind.Web;
    capabilities: ClientCapability[];
    ui_state?: Record<string, unknown>;
}
