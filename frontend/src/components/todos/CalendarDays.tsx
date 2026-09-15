import { CalendarDay } from "@/components/todos/CalendarDay";
import { WEEKDAY_HEADERS } from "@/lib/dates";

export function CalendarDays({
    cells,
    value,
    today,
    onSelect,
}: {
    cells: (string | null)[];
    value: string;
    today: string;
    onSelect: (iso: string) => void;
}) {
    return (
        <div>
            <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[10px] font-medium text-muted-foreground/70">
                {WEEKDAY_HEADERS.map((day) => (
                    <span key={day}>{day}</span>
                ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
                {cells.map((iso, i) => (
                    <CalendarDay
                        key={iso ?? `pad-${i}`}
                        iso={iso}
                        selected={iso !== null && iso === value}
                        isToday={iso !== null && iso === today}
                        onSelect={onSelect}
                    />
                ))}
            </div>
        </div>
    );
}
