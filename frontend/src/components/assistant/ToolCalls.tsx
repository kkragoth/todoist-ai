import { ToolCall } from "@/components/assistant/ToolCall";
import type { AssistantToolCall } from "@/stores/assistant-store";

export function ToolCalls({ calls }: { calls: AssistantToolCall[] }) {
    return (
        <ul className="mt-1 flex flex-col gap-1">
            {calls.map((call, i) => (
                <ToolCall key={`${call.tool}-${i}`} call={call} />
            ))}
        </ul>
    );
}
