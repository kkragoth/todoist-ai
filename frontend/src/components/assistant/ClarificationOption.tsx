export function ClarificationOption({
    option,
    index,
    onSend,
}: {
    option: string;
    index: number;
    onSend: (text: string) => void;
}) {
    return (
        <button
            type="button"
            onClick={() => onSend(option)}
            className="rounded-md border border-border px-2 py-1 text-left text-xs hover:border-sky-500 hover:text-sky-600 dark:hover:border-assistant-blue dark:hover:text-assistant-blue"
        >
            <span className="mr-1.5 font-mono text-muted-foreground">{index + 1}</span>
            {option}
        </button>
    );
}
