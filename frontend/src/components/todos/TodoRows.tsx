import { TodoRow } from "@/components/todos/TodoRow";
import type { Todo } from "@/lib/api";
import type { TodoBucket } from "@/lib/todo-buckets";
import { useTodosUiStore } from "@/stores/todos-ui-store";

export function TodoRows({ todos, bucket }: { todos: Todo[]; bucket: TodoBucket | null }) {
    const flashIds = useTodosUiStore((s) => s.flashIds);

    return (
        <>
            {todos.map((todo) => (
                <TodoRow key={todo.id} todo={todo} flash={flashIds.includes(todo.id)} bucket={bucket} />
            ))}
        </>
    );
}
