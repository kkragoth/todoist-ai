import { cn } from "cn";

export function TodoCheckbox({
    done,
    completed,
    onToggle,
}: {
    done: boolean;
    completed: boolean;
    onToggle: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onToggle}
            aria-label={completed ? "Mark as open" : "Mark as done"}
            className={cn(
                "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] transition-colors",
                done ? "border-muted-foreground bg-muted-foreground" : "border-border hover:border-foreground/40",
            )}
        >
            {done && (
                <svg viewBox="0 0 12 12" fill="none" className="size-[11px]">
                    <path
                        d="M2 6l2.5 2.5L10 3"
                        stroke="var(--card)"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            )}
        </button>
    );
}
