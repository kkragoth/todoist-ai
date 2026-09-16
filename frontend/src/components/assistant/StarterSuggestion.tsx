import { useAssistantSend } from "@/lib/assistant-send";

export function StarterSuggestion({ suggestion }: { suggestion: string }) {
    const send = useAssistantSend();
    return (
        <button
            type="button"
            onClick={() => send(suggestion)}
            className="rounded-lg border border-dashed border-border px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:border-sky-500 hover:text-sky-600 dark:hover:border-assistant-blue dark:hover:text-assistant-blue"
        >
            {suggestion}
        </button>
    );
}
