export function Chip({ label, onSelect }: { label: string; onSelect: (label: string) => void }) {
    return (
        <button
            type="button"
            onClick={() => onSelect(label)}
            className="rounded-full border border-border px-3 py-1 text-xs whitespace-nowrap text-muted-foreground hover:border-sky-500 hover:text-sky-600 dark:hover:border-assistant-blue dark:hover:text-assistant-blue"
        >
            {label}
        </button>
    );
}
