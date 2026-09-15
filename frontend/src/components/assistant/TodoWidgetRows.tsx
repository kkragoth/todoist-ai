import { TodoWidgetRow } from "@/components/assistant/TodoWidgetRow";
import type { WidgetTodo } from "@/lib/chat";

export function TodoWidgetRows({ todos, onHighlight }: { todos: WidgetTodo[]; onHighlight: (id: number) => void }) {
    return (
        <ul>
            {todos.map((todo) => (
                <TodoWidgetRow key={todo.id} todo={todo} onHighlight={onHighlight} />
            ))}
        </ul>
    );
}
