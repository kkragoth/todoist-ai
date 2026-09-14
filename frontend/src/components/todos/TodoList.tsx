import { useSearch } from "@tanstack/react-router";
import { ApiError } from "@/lib/api";
import { useTodosQuery } from "@/hooks/useTodos";
import { Button } from "@/components/ui/button";
import { TodoRow } from "@/components/todos/TodoRow";
import { TodosHeader } from "@/components/todos/TodosHeader";

interface TodoListProps {
    username: string | null;
    isAuthenticated: boolean;
    authChecked: boolean;
}

export function TodoList({ username, isAuthenticated, authChecked }: TodoListProps) {
    const search = useSearch({ from: "/todos" });
    const todosQuery = useTodosQuery(search, isAuthenticated && authChecked);
    const todos = todosQuery.data ?? [];

    return (
        <div className="mt-4">
            <TodosHeader username={username} todos={todos} />
            {todosQuery.isPending && <p className="mt-4 text-sm text-muted-foreground">Loading todos…</p>}
            {todosQuery.isError && (
                <p className="mt-4 text-sm text-destructive">
                    {todosQuery.error instanceof ApiError ? todosQuery.error.message : "Could not load todos."}{" "}
                    <Button variant="link" size="sm" onClick={() => todosQuery.refetch()}>
                        Retry
                    </Button>
                </p>
            )}
            {todosQuery.isSuccess && todos.length === 0 && (
                <p className="mt-4 rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
                    Nothing here. Add your first todo above.
                </p>
            )}
            <ul className="mt-4 flex flex-col gap-2">
                {todos.map((todo) => (
                    <TodoRow key={todo.id} todo={todo} />
                ))}
            </ul>
        </div>
    );
}
