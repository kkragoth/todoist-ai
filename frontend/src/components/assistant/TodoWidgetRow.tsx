import { cn } from "cn";
import { usePatchTodo } from "@/hooks/useTodos";
import type { WidgetTodo } from "@/lib/chat";
import { useAssistantStore } from "@/stores/assistant-store";

export function TodoWidgetRow({ todo, onHighlight }: { todo: WidgetTodo; onHighlight: (id: number) => void }) {
    const patchMutation = usePatchTodo();
    const setWidgetTodoCompleted = useAssistantStore((s) => s.setWidgetTodoCompleted);

    function handleToggle() {
        if (patchMutation.isPending) return;
        const next = !todo.completed;
        // Optimistic: widgets hold a point-in-time snapshot, so flip the
        // row locally for instant reactivity; the mutation reconciles the
        // main list + server, and rolls back here on failure.
        setWidgetTodoCompleted(todo.id, next);
        patchMutation.mutate(
            { id: todo.id, update: { completed: next } },
            { onError: () => setWidgetTodoCompleted(todo.id, todo.completed) },
        );
    }

    return (
        <li className="flex items-center gap-2 border-t border-border/50 px-2.5 py-1.5">
            <button
                type="button"
                onClick={handleToggle}
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
                onClick={() => onHighlight(todo.id)}
                title={`Highlight #${todo.id} in the list`}
                className="min-w-0 flex-1 truncate text-left text-[13px]"
            >
                <span className={cn(todo.completed ? "text-todo-done line-through decoration-todo-done/60" : "")}>
                    {todo.task}
                </span>
            </button>
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-px font-mono text-[11px] text-muted-foreground">
                {todo.todo_date}
            </span>{" "}
        </li>
    );
}
