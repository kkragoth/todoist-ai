import { ChevronLeft, ChevronRight } from "lucide-react";
import { monthLabel, shiftMonthCursor } from "@/lib/dates";

export function MonthNav({
    cursor,
    onCursor,
}: {
    cursor: { year: number; month: number };
    onCursor: (cursor: { year: number; month: number }) => void;
}) {
    return (
        <div className="mb-2 flex items-center justify-between">
            <button
                type="button"
                aria-label="Previous month"
                onClick={() => onCursor(shiftMonthCursor(cursor, -1))}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
                <ChevronLeft className="size-4" />
            </button>
            <p className="text-xs font-semibold">{monthLabel(cursor.year, cursor.month)}</p>
            <button
                type="button"
                aria-label="Next month"
                onClick={() => onCursor(shiftMonthCursor(cursor, 1))}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
                <ChevronRight className="size-4" />
            </button>
        </div>
    );
}
