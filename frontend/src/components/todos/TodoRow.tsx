import { Button } from "@/components/ui/button";
import { useArchiveTodo, usePatchTodo, useUnarchiveTodo } from "@/hooks/useTodos";
import type { Todo } from "@/lib/api";

export function TodoRow({ todo }: { todo: Todo }) {
    const patchMutation = usePatchTodo();
    const archiveMutation = useArchiveTodo();
    const unarchiveMutation = useUnarchiveTodo();

    return (
        <li className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${todo.archived ? "opacity-60" : ""}`}>
            <input
                type="checkbox"
                className="size-4 accent-current"
                checked={todo.completed}
                onChange={() => patchMutation.mutate({ id: todo.id, update: { completed: !todo.completed } })}
                title={todo.completed ? "Mark as open" : "Mark as done"}
            />
            <div className="min-w-0 flex-1">
                <p
                    className={`truncate text-sm font-medium ${todo.completed ? "line-through text-muted-foreground" : ""}`}
                >
                    {todo.task}
                </p>
                <p className="text-xs text-muted-foreground">
                    #{todo.id} · {todo.todo_date}
                    {todo.archived && " · archived"}
                </p>
            </div>
            <input
                type="date"
                className="h-7 rounded-md border border-input bg-background px-1.5 text-xs outline-none"
                value={todo.todo_date}
                onChange={(e) =>
                    e.target.value && patchMutation.mutate({ id: todo.id, update: { todo_date: e.target.value } })
                }
                title="Reschedule"
            />
            {todo.archived ? (
                <Button variant="outline" size="xs" onClick={() => unarchiveMutation.mutate(todo.id)}>
                    Restore
                </Button>
            ) : (
                <Button variant="destructive" size="xs" onClick={() => archiveMutation.mutate(todo.id)}>
                    Delete
                </Button>
            )}
        </li>
    );
}
