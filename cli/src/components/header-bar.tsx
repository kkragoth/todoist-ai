import { ConnectionStatusBadge } from "@/components/connection-status.js";
import { useSessionStore } from "@/stores/session-store.js";

/** Top title bar: user · provider:model · thread · connection state. */
export function HeaderBar() {
    const username = useSessionStore((s) => s.username);
    const provider = useSessionStore((s) => s.provider);
    const model = useSessionStore((s) => s.model);
    const threadId = useSessionStore((s) => s.threadId);
    const mcpDirect = useSessionStore((s) => s.mcpDirect);

    return (
        <box
            border
            borderStyle="single"
            flexDirection="row"
            justifyContent="space-between"
            style={{ paddingLeft: 1, paddingRight: 1 }}
        >
            <text>
                <strong fg="cyan">Todoist AI</strong>
                <span fg="gray">
                    {" "}
                    · {username || "…"} · {provider ?? "default"}:{model ?? "default"} · thread {threadId || "…"}
                </span>
                {mcpDirect && <strong fg="yellow"> · MCP-DIRECT</strong>}
            </text>
            <ConnectionStatusBadge />
        </box>
    );
}
