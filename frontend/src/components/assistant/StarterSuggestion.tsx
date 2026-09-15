export function StarterSuggestion({ suggestion, onSend }: { suggestion: string; onSend: (text: string) => void }) {
    return (
        <button
            type="button"
            onClick={() => onSend(suggestion)}
            className="rounded-lg border border-dashed border-border px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:border-sky-500 hover:text-sky-600 dark:hover:border-assistant-blue dark:hover:text-assistant-blue"
        >
            {suggestion}
        </button>
    );
}
