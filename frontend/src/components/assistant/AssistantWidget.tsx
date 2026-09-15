import { TodoListWidget } from "@/components/assistant/TodoListWidget";
import { WidgetKind, type AssistantWidget as AssistantWidgetData } from "@/lib/chat";

export function AssistantWidget({ widget }: { widget: AssistantWidgetData }) {
    switch (widget.kind) {
        case WidgetKind.TodoList:
            return <TodoListWidget widget={widget} />;
        default:
            return null;
    }
}
