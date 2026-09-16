import { TodoRow } from "@/components/todos/TodoRow";
import type { Todo } from "@/lib/api";
import type { TodoBucket } from "@/lib/todo-buckets";

export function TodoRows({ todos, bucket }: { todos: Todo[]; bucket: TodoBucket | null }) {
    return (
        <>
            {todos.map((todo) => (
                <TodoRow key={todo.id} todo={todo} bucket={bucket} />
            ))}
        </>
    );
}
