import { cn } from "cn";

export function CalendarDay({
    iso,
    selected,
    isToday,
    onSelect,
}: {
    iso: string | null;
    selected: boolean;
    isToday: boolean;
    onSelect: (iso: string) => void;
}) {
    if (iso === null) return <span aria-hidden="true" />;
    const day = Number(iso.slice(8, 10));
    return (
        <button
            type="button"
            onClick={() => onSelect(iso)}
            aria-label={`Pick ${iso}`}
            aria-pressed={selected}
            className={cn(
                "flex size-7 items-center justify-center rounded-md text-xs transition-colors",
                selected
                    ? "bg-primary font-semibold text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                !selected && isToday && "border border-primary/60 text-foreground",
            )}
        >
            {day}
        </button>
    );
}
