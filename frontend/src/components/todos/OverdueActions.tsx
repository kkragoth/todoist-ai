import { cn } from "cn";

/** Hover-revealed controls keep their layout space and cross-fade in/out instead of popping the row. */
export const HOVER_REVEAL =
    "pointer-events-none opacity-0 transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 pointer-coarse:pointer-events-auto pointer-coarse:opacity-100";

export function OverdueActions({ onReschedule }: { onReschedule: (daysFromToday: number) => void }) {
    return (
        <span className={cn("items-center gap-1", HOVER_REVEAL, "hidden group-hover:flex group-focus-within:flex")}>
            <button
                type="button"
                onClick={() => onReschedule(0)}
                className="rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:border-amber-500 hover:text-amber-600 dark:hover:border-gold dark:hover:text-gold"
            >
                → Today
            </button>
            <button
                type="button"
                onClick={() => onReschedule(1)}
                className="rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:border-amber-500 hover:text-amber-600 dark:hover:border-gold dark:hover:text-gold"
            >
                → Tomorrow
            </button>
        </span>
    );
}
