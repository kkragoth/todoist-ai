// Point-in-time snapshot of a chat listing. Rows are compact and clickable:
// the body highlights + scrolls to the real row in the main list, the
// checkbox toggles completion through the same mutation as TodoRow.

import { useState } from "react";
import { cn } from "cn";
import { ChevronRight } from "lucide-react";
import { usePatchTodo } from "@/hooks/useTodos";
import { highlightTodoIds } from "@/lib/highlight-todos";
import type { TodoListWidgetData } from "@/lib/chat";

const VISIBLE_ROWS = 8;

export function TodoListWidget({ widget }: { widget: TodoListWidgetData }) {
    const patchMutation = usePatchTodo();
    const [collapsed, setCollapsed] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const visible = expanded ? widget.todos : widget.todos.slice(0, VISIBLE_ROWS);

    return (
        <div className="mt-2 overflow-hidden rounded-lg border border-border bg-card">
            <button
                type="button"
                onClick={() => setCollapsed(!collapsed)}
                aria-expanded={!collapsed}
                className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-xs font-medium text-foreground"
            >
                <ChevronRight
                    className={cn("size-3.5 text-muted-foreground transition-transform", !collapsed && "rotate-90")}
                />
                {widget.open} open · {widget.done} done
                {widget.truncated && (
                    <span className="font-normal text-muted-foreground">
                        {" "}
                        · showing {widget.todos.length} of {widget.total}
                    </span>
                )}
            </button>
            {!collapsed && (
                <>
                    <ul>
                        {visible.map((todo) => (
                            <li
                                key={todo.id}
                                className="flex items-center gap-2 border-t border-border/50 px-2.5 py-1.5"
                            >
                                <button
                                    type="button"
                                    onClick={() =>
                                        patchMutation.mutate({ id: todo.id, update: { completed: !todo.completed } })
                                    }
                                    aria-label={todo.completed ? "Mark as open" : "Mark as done"}
                                    className={cn(
                                        "flex size-4 shrink-0 items-center justify-center rounded border-[1.5px] transition-colors",
                                        todo.completed
                                            ? "border-muted-foreground bg-muted-foreground"
                                            : "border-border hover:border-foreground/40",
                                    )}
                                >
                                    {todo.completed && (
                                        <svg viewBox="0 0 12 12" fill="none" className="size-2.5">
                                            <path
                                                d="M2 6l2.5 2.5L10 3"
                                                stroke="var(--card)"
                                                strokeWidth="1.6"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            />
                                        </svg>
                                    )}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => highlightTodoIds([todo.id])}
                                    title={`Highlight #${todo.id} in the list`}
                                    className="min-w-0 flex-1 truncate text-left text-[13px]"
                                >
                                    <span className={cn(todo.completed && "text-muted-foreground line-through")}>
                                        {todo.task}
                                    </span>
                                </button>
                                <span className="shrink-0 rounded-full bg-muted px-1.5 py-px font-mono text-[11px] text-muted-foreground">
                                    {todo.todo_date}
                                </span>
                            </li>
                        ))}
                    </ul>
                    {widget.todos.length > VISIBLE_ROWS && (
                        <button
                            type="button"
                            onClick={() => setExpanded(!expanded)}
                            className="w-full border-t border-border/50 px-2.5 py-1 text-left text-xs text-muted-foreground hover:text-foreground"
                        >
                            {expanded ? "Show less" : `Show all ${widget.todos.length}`}
                        </button>
                    )}
                </>
            )}
        </div>
    );
}
