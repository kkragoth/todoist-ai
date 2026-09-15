// Point-in-time snapshot of a chat listing. Rows are compact and clickable:
// the body highlights + scrolls to the real row in the main list, the
// checkbox toggles completion through the same mutation as TodoRow.

import { useState } from "react";
import { cn } from "cn";
import { ChevronRight } from "lucide-react";
import { TodoWidgetRows } from "@/components/assistant/TodoWidgetRows";
import { highlightTodoIds } from "@/lib/highlight-todos";
import type { TodoListWidgetData } from "@/lib/chat";

const WIDGET_VISIBLE_ROWS = 8;

export function TodoListWidget({ widget }: { widget: TodoListWidgetData }) {
    const [collapsed, setCollapsed] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const visible = expanded ? widget.todos : widget.todos.slice(0, WIDGET_VISIBLE_ROWS);

    function handleHighlight(id: number) {
        highlightTodoIds([id]);
    }

    return (
        <div className="mt-2 overflow-hidden rounded-lg border border-border bg-card">
            <button
                type="button"
                onClick={() => setCollapsed((v) => !v)}
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
                <span
                    className="ml-auto flex items-center gap-1 font-normal text-muted-foreground"
                    title="Checking a box here updates the same task in your main list instantly."
                >
                    <span className="size-1.5 rounded-full bg-[#4caf7d]" aria-hidden="true" />
                    Synced with your list
                </span>
            </button>
            {!collapsed && (
                <>
                    <TodoWidgetRows todos={visible} onHighlight={handleHighlight} />
                    {widget.todos.length > WIDGET_VISIBLE_ROWS && (
                        <button
                            type="button"
                            onClick={() => setExpanded((v) => !v)}
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
