import { useSessionStore } from "@/stores/session-store.js";

/** Top title bar: user · provider:model · thread. */
export function HeaderBar() {
    const username = useSessionStore((s) => s.username);
    const provider = useSessionStore((s) => s.provider);
    const model = useSessionStore((s) => s.model);
    const threadId = useSessionStore((s) => s.threadId);

    return (
        <box border borderStyle="single" style={{ paddingLeft: 1, paddingRight: 1 }}>
            <text>
                <strong fg="cyan">Todoist AI</strong>
                <span fg="gray">
                    {" "}
                    · {username || "…"} · {provider ?? "default"}:{model ?? "default"} · thread {threadId || "…"}
                </span>
            </text>
        </box>
    );
}
