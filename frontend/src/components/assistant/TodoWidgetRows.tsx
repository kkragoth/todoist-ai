import { TodoWidgetRow } from "@/components/assistant/TodoWidgetRow";
import type { WidgetTodo } from "@/lib/chat";

export function TodoWidgetRows({ todos }: { todos: WidgetTodo[] }) {
    return (
        <ul>
            {todos.map((todo) => (
                <TodoWidgetRow key={todo.id} todo={todo} />
            ))}
        </ul>
    );
}
