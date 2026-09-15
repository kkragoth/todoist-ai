import { addDaysISO } from "@/lib/dates";

export function DateShortcuts({
    today,
    value,
    allowClear,
    onPick,
}: {
    today: string;
    value: string;
    allowClear: boolean;
    onPick: (iso: string) => void;
}) {
    return (
        <div className="mt-2 flex flex-wrap gap-1 border-t border-border/60 pt-2">
            <button
                type="button"
                onClick={() => onPick(today)}
                className="rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
                Today
            </button>
            <button
                type="button"
                onClick={() => onPick(addDaysISO(today, 1))}
                className="rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
                Tomorrow
            </button>
            <button
                type="button"
                onClick={() => onPick(addDaysISO(today, 7))}
                className="rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
                +1wk
            </button>
            {allowClear && value && (
                <button
                    type="button"
                    onClick={() => onPick("")}
                    className="ml-auto rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                    Clear
                </button>
            )}
        </div>
    );
}
