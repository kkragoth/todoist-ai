import type { Todo } from "@/lib/api";
import { todayISO } from "@/lib/todos-filters";

export enum TodoBucket {
    Overdue = "overdue",
    Today = "today",
    Tomorrow = "tomorrow",
    ThisWeek = "week",
    Later = "later",
}

export const BUCKET_ORDER: TodoBucket[] = [
    TodoBucket.Overdue,
    TodoBucket.Today,
    TodoBucket.Tomorrow,
    TodoBucket.ThisWeek,
    TodoBucket.Later,
];

export function bucketLabel(bucket: TodoBucket): string {
    switch (bucket) {
        case TodoBucket.Overdue:
            return "Overdue";
        case TodoBucket.Today:
            return "Today";
        case TodoBucket.Tomorrow:
            return "Tomorrow";
        case TodoBucket.ThisWeek:
            return "This week";
        case TodoBucket.Later:
            return "Later";
    }
}

function diffDays(dateISO: string, today: string): number {
    const dt = new Date(`${dateISO}T00:00:00Z`).getTime();
    const base = new Date(`${today}T00:00:00Z`).getTime();
    return Math.round((dt - base) / 86400000);
}

export function bucketOf(dateISO: string | null | undefined, today: string = todayISO()): TodoBucket {
    if (!dateISO) return TodoBucket.Later;
    const diff = diffDays(dateISO, today);
    if (diff < 0) return TodoBucket.Overdue;
    if (diff === 0) return TodoBucket.Today;
    if (diff === 1) return TodoBucket.Tomorrow;
    if (diff >= 2 && diff <= 6) return TodoBucket.ThisWeek;
    return TodoBucket.Later;
}

export function isOverdueBucket(bucket: TodoBucket): boolean {
    switch (bucket) {
        case TodoBucket.Overdue:
            return true;
        case TodoBucket.Today:
        case TodoBucket.Tomorrow:
        case TodoBucket.ThisWeek:
        case TodoBucket.Later:
            return false;
    }
}

export function isTodayBucket(bucket: TodoBucket): boolean {
    switch (bucket) {
        case TodoBucket.Today:
            return true;
        case TodoBucket.Overdue:
        case TodoBucket.Tomorrow:
        case TodoBucket.ThisWeek:
        case TodoBucket.Later:
            return false;
    }
}

/**
 * Day-precision buckets already state the due day in the group header, so a
 * row inside them hides its redundant due chip (a hover calendar keeps
 * rescheduling reachable). Coarser buckets keep the chip: it names the exact
 * day or date.
 */
export function hidesDueChip(bucket: TodoBucket): boolean {
    switch (bucket) {
        case TodoBucket.Today:
        case TodoBucket.Tomorrow:
            return true;
        case TodoBucket.Overdue:
        case TodoBucket.ThisWeek:
        case TodoBucket.Later:
            return false;
    }
}

/** Stable sort: date ASC (dateless last), then created_at ASC, then id ASC. */
export function sortTodos(todos: Todo[]): Todo[] {
    return [...todos].sort((a, b) => {
        if (a.todo_date !== b.todo_date) {
            if (!a.todo_date) return 1;
            if (!b.todo_date) return -1;
            if (a.todo_date < b.todo_date) return -1;
            if (a.todo_date > b.todo_date) return 1;
        }
        if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
        return a.id - b.id;
    });
}

export interface BucketGroup {
    bucket: TodoBucket;
    items: Todo[];
}

export function groupTodos(todos: Todo[], today: string = todayISO()): BucketGroup[] {
    const sorted = sortTodos(todos);
    return BUCKET_ORDER.map((bucket) => ({
        bucket,
        items: sorted.filter((todo) => bucketOf(todo.todo_date, today) === bucket),
    })).filter((group) => group.items.length > 0);
}

export enum DueTone {
    Overdue = "overdue",
    Today = "today",
    Neutral = "neutral",
}

export function dueToneOf(dateISO: string | null | undefined, today: string = todayISO()): DueTone {
    const bucket = bucketOf(dateISO, today);
    if (isOverdueBucket(bucket)) return DueTone.Overdue;
    if (isTodayBucket(bucket)) return DueTone.Today;
    return DueTone.Neutral;
}

export function isOverdueTone(tone: DueTone): boolean {
    switch (tone) {
        case DueTone.Overdue:
            return true;
        case DueTone.Today:
        case DueTone.Neutral:
            return false;
    }
}

export function isTodayTone(tone: DueTone): boolean {
    switch (tone) {
        case DueTone.Today:
            return true;
        case DueTone.Overdue:
        case DueTone.Neutral:
            return false;
    }
}

export function relativeDueLabel(dateISO: string | null | undefined, today: string = todayISO()): string {
    if (!dateISO) return "No date";
    const diff = diffDays(dateISO, today);
    if (diff === 0) return "Today";
    if (diff === -1) return "Yesterday";
    if (diff < -1) return `${-diff}d overdue`;
    if (diff === 1) return "Tomorrow";
    const dt = new Date(`${dateISO}T00:00:00Z`);
    if (diff > 1 && diff <= 6) {
        return dt.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
    }
    return dt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export interface NaturalDateHit {
    offset: number;
    label: string;
}

const NATURAL_PATTERNS: { re: RegExp; offset: number; label: string }[] = [
    { re: /\bnext week\b/i, offset: 7, label: "Next week" },
    { re: /\btomorrow\b/i, offset: 1, label: "Tomorrow" },
    { re: /\btoday\b/i, offset: 0, label: "Today" },
    { re: /\byesterday\b/i, offset: -1, label: "Yesterday" },
    { re: /\bmonday\b/i, offset: 0, label: "Monday" },
    { re: /\bfriday\b/i, offset: 0, label: "Friday" },
];

function shiftISO(iso: string, days: number): string {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

function nextWeekdayOffset(today: string, weekday: number): number {
    const base = new Date(`${today}T00:00:00Z`).getUTCDay();
    const delta = (weekday - base + 7) % 7;
    return delta === 0 ? 7 : delta;
}

export function detectNaturalDate(text: string, today: string = todayISO()): NaturalDateHit | null {
    const lower = text.toLowerCase();
    if (/\bnext week\b/i.test(text)) return { offset: 7, label: "Next week" };
    if (/\btomorrow\b/i.test(text)) return { offset: 1, label: "Tomorrow" };
    if (/\btoday\b/i.test(text)) return { offset: 0, label: "Today" };
    if (/\byesterday\b/i.test(text)) return { offset: -1, label: "Yesterday" };
    if (/\bmonday\b/.test(lower)) return { offset: nextWeekdayOffset(today, 1), label: "Monday" };
    if (/\bfriday\b/.test(lower)) return { offset: nextWeekdayOffset(today, 5), label: "Friday" };
    return null;
}

export function naturalDateISO(text: string, today: string = todayISO()): string | null {
    const hit = detectNaturalDate(text, today);
    if (!hit) return null;
    return shiftISO(today, hit.offset);
}

export function naturalDatePreview(text: string, today: string = todayISO()): string | null {
    const hit = detectNaturalDate(text, today);
    if (!hit) return null;
    const iso = shiftISO(today, hit.offset);
    const dt = new Date(`${iso}T00:00:00Z`);
    return `→ due ${hit.label}, ${dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}`;
}

export function hasNaturalDate(text: string): boolean {
    return NATURAL_PATTERNS.some((pattern) => pattern.re.test(text));
}
