// Date helpers for the themed date picker (no native `<input type="date">`).
// All dates are day-precision `YYYY-MM-DD` strings handled in UTC so the
// button label, calendar grid, and stored `todo_date` always agree.

import { todayISO } from "@/lib/todos-filters";

export function isISODateString(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function addDaysISO(iso: string, days: number): string {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

/** "2026-09-14" -> "14 Sep 2026". Empty -> fallback label. */
export function formatDateButtonLabel(iso: string, emptyLabel = "Set date"): string {
    if (!isISODateString(iso)) return emptyLabel;
    const dt = new Date(`${iso}T00:00:00Z`);
    return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** "2026-09-14" -> { year: 2026, month: 8 } (month is 0-indexed for Date UTC). */
export function monthCursorOf(iso: string): { year: number; month: number } {
    if (isISODateString(iso)) {
        const dt = new Date(`${iso}T00:00:00Z`);
        return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() };
    }
    return monthCursorOf(todayISO());
}

export function monthLabel(year: number, month: number): string {
    return new Date(Date.UTC(year, month, 1)).toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
    });
}

export function shiftMonthCursor(
    cursor: { year: number; month: number },
    delta: number,
): { year: number; month: number } {
    const next = new Date(Date.UTC(cursor.year, cursor.month + delta, 1));
    return { year: next.getUTCFullYear(), month: next.getUTCMonth() };
}

export function isoOfCell(year: number, month: number, day: number): string {
    return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

/**
 * Monday-first calendar grid for the month. `null` pads leading/trailing
 * cells so every week has 7 entries.
 */
export function monthGrid(year: number, month: number): (string | null)[] {
    const first = new Date(Date.UTC(year, month, 1));
    // getUTCDay: 0=Sun..6=Sat -> offset to Monday-first (0=Mon..6=Sun).
    const lead = (first.getUTCDay() + 6) % 7;
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const cells: (string | null)[] = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let day = 1; day <= daysInMonth; day++) cells.push(isoOfCell(year, month, day));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
}

export const WEEKDAY_HEADERS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
