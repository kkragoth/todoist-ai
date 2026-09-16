import { AssistantWidget } from "@/components/assistant/AssistantWidget";
import type { AssistantWidget as AssistantWidgetData } from "@/lib/chat";

export function AssistantWidgets({ widgets }: { widgets: AssistantWidgetData[] }) {
    return (
        <>
            {widgets.map((widget, i) => (
                <AssistantWidget key={`${widget.kind}-${i}`} widget={widget} />
            ))}
        </>
    );
}
