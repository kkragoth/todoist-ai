import type { Todo } from "@/lib/api";

function countOpen(todos: Todo[]): number {
    return todos.filter((todo) => !todo.completed && !todo.archived).length;
}

export function TodosHeader({ todos }: { todos: Todo[] }) {
    return (
        <div className="flex items-center justify-end">
            <p className="text-sm text-muted-foreground">
                {countOpen(todos)} open · {todos.length} shown
            </p>
        </div>
    );
}
