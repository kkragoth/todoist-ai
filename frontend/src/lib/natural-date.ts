// Natural-language date detection for the add-task input ("tomorrow",
// "next week", weekday names). Day-precision YYYY-MM-DD in UTC, matching
// `lib/dates.ts` conventions.

import { addDaysISO } from "@/lib/dates";
import { todayISO } from "@/lib/todos-filters";

export interface NaturalDateHit {
    offset: number;
    label: string;
}

const FIXED_PATTERNS: { re: RegExp; offset: number; label: string }[] = [
    { re: /\bnext week\b/i, offset: 7, label: "Next week" },
    { re: /\btomorrow\b/i, offset: 1, label: "Tomorrow" },
    { re: /\btoday\b/i, offset: 0, label: "Today" },
    { re: /\byesterday\b/i, offset: -1, label: "Yesterday" },
];

const WEEKDAY_PATTERNS: { re: RegExp; weekday: number; label: string }[] = [
    { re: /\bmonday\b/i, weekday: 1, label: "Monday" },
    { re: /\bfriday\b/i, weekday: 5, label: "Friday" },
];

export const NATURAL_PATTERNS: RegExp[] = [...FIXED_PATTERNS.map((p) => p.re), ...WEEKDAY_PATTERNS.map((p) => p.re)];

function nextWeekdayOffset(today: string, weekday: number): number {
    const base = new Date(`${today}T00:00:00Z`).getUTCDay();
    const delta = (weekday - base + 7) % 7;
    return delta === 0 ? 7 : delta;
}

export function detectNaturalDate(text: string, today: string = todayISO()): NaturalDateHit | null {
    for (const pattern of FIXED_PATTERNS) {
        if (pattern.re.test(text)) return { offset: pattern.offset, label: pattern.label };
    }
    for (const pattern of WEEKDAY_PATTERNS) {
        if (pattern.re.test(text)) return { offset: nextWeekdayOffset(today, pattern.weekday), label: pattern.label };
    }
    return null;
}

export function naturalDateISO(text: string, today: string = todayISO()): string | null {
    const hit = detectNaturalDate(text, today);
    if (!hit) return null;
    return addDaysISO(today, hit.offset);
}

export function naturalDatePreview(text: string, today: string = todayISO()): string | null {
    const hit = detectNaturalDate(text, today);
    if (!hit) return null;
    const iso = addDaysISO(today, hit.offset);
    const dt = new Date(`${iso}T00:00:00Z`);
    return `→ due ${hit.label}, ${dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}`;
}

export function hasNaturalDate(text: string): boolean {
    return NATURAL_PATTERNS.some((re) => re.test(text));
}
