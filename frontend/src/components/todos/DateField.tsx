// Themed date button + calendar popover. Replaces the native
// `<input type="date">` so the control matches the app theme instead of
// rendering OS/browser chrome. The caller owns the ISO value (natural-
// language parsing in the parent keeps working — the label just reflects
// whatever date results).

import { useEffect, useId, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "cn";
import { CalendarDays } from "@/components/todos/CalendarDays";
import { addDaysISO, monthCursorOf, monthGrid, monthLabel, shiftMonthCursor } from "@/lib/dates";
import { todayISO } from "@/lib/todos-filters";

export function DateField({
    value,
    onChange,
    label,
    title,
    className,
    iconOnly = false,
    allowClear = false,
    ariaLabel = "Pick a date",
}: {
    value: string;
    onChange: (iso: string) => void;
    label: string;
    title?: string;
    className?: string;
    iconOnly?: boolean;
    allowClear?: boolean;
    ariaLabel?: string;
}) {
    const [open, setOpen] = useState(false);
    const [cursor, setCursor] = useState(() => monthCursorOf(value));
    const rootRef = useRef<HTMLDivElement>(null);
    const popoverId = useId();
    const today = todayISO();

    useEffect(() => {
        if (!open) return;
        function onPointerDown(e: PointerEvent) {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
        }
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") setOpen(false);
        }
        document.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open]);

    function pick(iso: string) {
        onChange(iso);
        setOpen(false);
    }

    const cells = monthGrid(cursor.year, cursor.month);

    return (
        <div ref={rootRef} className="relative shrink-0">
            <button
                type="button"
                title={title}
                aria-label={ariaLabel}
                aria-expanded={open}
                aria-controls={popoverId}
                onClick={() => {
                    if (!open) setCursor(monthCursorOf(value));
                    setOpen((v) => !v);
                }}
                className={cn(
                    iconOnly
                        ? "inline-flex size-7 items-center justify-center rounded-full border border-border text-muted-foreground hover:border-amber-500 hover:text-amber-600 dark:hover:border-gold dark:hover:text-gold"
                        : "inline-flex items-center gap-1.5 rounded-md border border-input bg-card px-2 py-1 text-xs whitespace-nowrap text-muted-foreground outline-none hover:text-foreground",
                    className,
                )}
            >
                <Calendar className="size-3.5 shrink-0" />
                {!iconOnly && <span>{label}</span>}
            </button>
            {open && (
                <div
                    id={popoverId}
                    role="dialog"
                    aria-label="Pick a date"
                    className="absolute right-0 z-30 mt-1.5 w-60 rounded-xl border border-border bg-card p-3 shadow-lg"
                >
                    <div className="mb-2 flex items-center justify-between">
                        <button
                            type="button"
                            aria-label="Previous month"
                            onClick={() => setCursor((c) => shiftMonthCursor(c, -1))}
                            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                            <ChevronLeft className="size-4" />
                        </button>
                        <p className="text-xs font-semibold">{monthLabel(cursor.year, cursor.month)}</p>
                        <button
                            type="button"
                            aria-label="Next month"
                            onClick={() => setCursor((c) => shiftMonthCursor(c, 1))}
                            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                            <ChevronRight className="size-4" />
                        </button>
                    </div>
                    <CalendarDays cells={cells} value={value} today={today} onSelect={pick} />
                    <div className="mt-2 flex flex-wrap gap-1 border-t border-border/60 pt-2">
                        <button
                            type="button"
                            onClick={() => pick(today)}
                            className="rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                            Today
                        </button>
                        <button
                            type="button"
                            onClick={() => pick(addDaysISO(today, 1))}
                            className="rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                            Tomorrow
                        </button>
                        <button
                            type="button"
                            onClick={() => pick(addDaysISO(today, 7))}
                            className="rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                            +1wk
                        </button>
                        {allowClear && value && (
                            <button
                                type="button"
                                onClick={() => pick("")}
                                className="ml-auto rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                                Clear
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
