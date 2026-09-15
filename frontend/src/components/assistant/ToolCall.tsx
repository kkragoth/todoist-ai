import type { AssistantToolCall } from "@/stores/assistant-store";

export function ToolCall({ call }: { call: AssistantToolCall }) {
    return (
        <li className="rounded-md bg-muted px-2 py-1 font-mono text-[11px]">
            {call.tool}
            {call.output === undefined ? " …" : ""}
        </li>
    );
}
