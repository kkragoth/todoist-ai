import { highlightTodoIds } from "@/lib/highlight-todos";

export function AssistantTextPart({ part }: { part: string }) {
    const match = /^#(\d+)$/.exec(part);
    if (!match) return <span>{part}</span>;
    const id = Number(match[1]);
    return (
        <button
            type="button"
            onClick={() => highlightTodoIds([id])}
            className="rounded-full border border-sky-500/40 bg-sky-500/10 px-1.5 py-px text-xs font-medium text-sky-600 dark:border-assistant-blue/40 dark:bg-assistant-blue/10 dark:text-assistant-blue"
        >
            #{id}
        </button>
    );
}
