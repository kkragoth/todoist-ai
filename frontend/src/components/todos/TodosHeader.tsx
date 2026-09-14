import type { Todo } from "@/lib/api";

interface TodosHeaderProps {
    username: string | null;
    todos: Todo[];
}

function countOpen(todos: Todo[]): number {
    return todos.filter((todo) => !todo.completed && !todo.archived).length;
}

export function TodosHeader({ username, todos }: TodosHeaderProps) {
    return (
        <div className="flex items-baseline justify-between gap-4">
            <h1 className="text-2xl font-semibold tracking-tight">{username ? `${username}'s todos` : "Todos"}</h1>
            <p className="text-sm text-muted-foreground">
                {countOpen(todos)} open · {todos.length} shown
            </p>
        </div>
    );
}
