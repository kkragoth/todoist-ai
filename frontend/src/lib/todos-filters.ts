import type { TodosQuery } from "@/lib/api";
import { addDaysISO } from "@/lib/dates";

export enum TodoStatus {
    All = "all",
    Open = "open",
    Done = "done",
}

export enum DatePreset {
    All = "all",
    Overdue = "overdue",
    Today = "today",
    Tomorrow = "tomorrow",
    Week = "week",
    Later = "later",
    Custom = "custom",
}

/**
 * URL search state for `/todos`. Keys are snake_case on purpose so the URL
 * reads `?status=open&archived=true&date_preset=today` and
 * `?date_preset=custom&start_date=…&end_date=…`.
 */
export interface TodosSearchParams {
    status: TodoStatus;
    archived: boolean;
    date_preset: DatePreset;
    /** Only meaningful when `date_preset` is Custom; omitted from the URL otherwise. */
    start_date?: string;
    end_date?: string;
}

export const DEFAULT_SEARCH: TodosSearchParams = {
    status: TodoStatus.All,
    archived: false,
    date_preset: DatePreset.All,
    start_date: "",
    end_date: "",
};

export function parseTodoStatus(value: unknown): TodoStatus {
    switch (value) {
        case TodoStatus.Open:
            return TodoStatus.Open;
        case TodoStatus.Done:
            return TodoStatus.Done;
        case TodoStatus.All:
            return TodoStatus.All;
        default:
            return TodoStatus.All;
    }
}

export function parseTodoStatusStrict(value: unknown): TodoStatus | null {
    switch (value) {
        case TodoStatus.Open:
            return TodoStatus.Open;
        case TodoStatus.Done:
            return TodoStatus.Done;
        case TodoStatus.All:
            return TodoStatus.All;
        default:
            return null;
    }
}

export function parseDatePreset(value: unknown): DatePreset {
    switch (value) {
        case DatePreset.Overdue:
            return DatePreset.Overdue;
        case DatePreset.Today:
            return DatePreset.Today;
        case DatePreset.Tomorrow:
            return DatePreset.Tomorrow;
        case DatePreset.Week:
            return DatePreset.Week;
        case DatePreset.Later:
            return DatePreset.Later;
        case DatePreset.Custom:
            return DatePreset.Custom;
        case DatePreset.All:
            return DatePreset.All;
        default:
            return DatePreset.All;
    }
}

export function parseDatePresetStrict(value: unknown): DatePreset | null {
    switch (value) {
        case DatePreset.Overdue:
            return DatePreset.Overdue;
        case DatePreset.Today:
            return DatePreset.Today;
        case DatePreset.Tomorrow:
            return DatePreset.Tomorrow;
        case DatePreset.Week:
            return DatePreset.Week;
        case DatePreset.Later:
            return DatePreset.Later;
        case DatePreset.Custom:
            return DatePreset.Custom;
        case DatePreset.All:
            return DatePreset.All;
        default:
            return null;
    }
}

export function parseArchived(value: unknown): boolean {
    switch (value) {
        case true:
        case "true":
        case "1":
            return true;
        default:
            return false;
    }
}

function isISODate(value: unknown): value is string {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function parseISODateParam(value: unknown): string {
    return isISODate(value) ? value : "";
}

export function parseSearch(raw: Record<string, unknown>): TodosSearchParams {
    const date_preset = parseDatePreset(raw["date_preset"]);
    const base = {
        status: parseTodoStatus(raw["status"]),
        archived: parseArchived(raw["archived"]),
        date_preset,
    };
    switch (date_preset) {
        case DatePreset.Custom:
            return {
                ...base,
                start_date: parseISODateParam(raw["start_date"]),
                end_date: parseISODateParam(raw["end_date"]),
            };
        default:
            return base;
    }
}

export function isOpenStatus(status: TodoStatus): boolean {
    switch (status) {
        case TodoStatus.Open:
            return true;
        case TodoStatus.All:
        case TodoStatus.Done:
            return false;
    }
}

export function isDoneStatus(status: TodoStatus): boolean {
    switch (status) {
        case TodoStatus.Done:
            return true;
        case TodoStatus.All:
        case TodoStatus.Open:
            return false;
    }
}

export function statusLabel(status: TodoStatus): string {
    switch (status) {
        case TodoStatus.All:
            return "All";
        case TodoStatus.Open:
            return "Open";
        case TodoStatus.Done:
            return "Done";
    }
}

export function datePresetLabel(preset: DatePreset): string {
    switch (preset) {
        case DatePreset.All:
            return "All dates";
        case DatePreset.Overdue:
            return "Overdue";
        case DatePreset.Today:
            return "Today";
        case DatePreset.Tomorrow:
            return "Tomorrow";
        case DatePreset.Week:
            return "This week";
        case DatePreset.Later:
            return "Later";
        case DatePreset.Custom:
            return "Custom";
    }
}

export function completedParam(status: TodoStatus): boolean | undefined {
    switch (status) {
        case TodoStatus.All:
            return undefined;
        case TodoStatus.Open:
            return false;
        case TodoStatus.Done:
            return true;
    }
}

export function toISODate(d: Date): string {
    return d.toISOString().slice(0, 10);
}

export function todayISO(): string {
    return toISODate(new Date());
}

function shiftISO(iso: string, days: number): string {
    return addDaysISO(iso, days);
}

export interface ResolvedDateRange {
    targetDate?: string;
    dateFrom?: string;
    dateTo?: string;
}

export function resolveDateRange(search: TodosSearchParams, today: string = todayISO()): ResolvedDateRange {
    switch (search.date_preset) {
        case DatePreset.All:
            return {};
        case DatePreset.Overdue:
            return { dateTo: shiftISO(today, -1) };
        case DatePreset.Today:
            return { targetDate: today };
        case DatePreset.Tomorrow:
            return { targetDate: shiftISO(today, 1) };
        case DatePreset.Week:
            return { dateFrom: shiftISO(today, 2), dateTo: shiftISO(today, 6) };
        case DatePreset.Later:
            return { dateFrom: shiftISO(today, 7) };
        case DatePreset.Custom: {
            const range: ResolvedDateRange = {};
            if (search.start_date) range.dateFrom = search.start_date;
            if (search.end_date) range.dateTo = search.end_date;
            return range;
        }
    }
}

export function toTodosQuery(search: TodosSearchParams, today: string = todayISO()): TodosQuery {
    const range = resolveDateRange(search, today);
    return {
        completed: completedParam(search.status),
        includeArchived: search.archived,
        targetDate: range.targetDate,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
    };
}

export function todosQueryKey(search: TodosSearchParams, today: string = todayISO()): (string | boolean)[] {
    const query = toTodosQuery(search, today);
    return [
        "todos",
        search.status,
        search.archived,
        search.date_preset,
        search.start_date ?? "",
        search.end_date ?? "",
        query.targetDate ?? "",
        query.dateFrom ?? "",
        query.dateTo ?? "",
        query.completed ?? "all",
    ];
}

/** Prefill for the Custom preset: today → one month out. */
export function defaultCustomDateRange(today: string = todayISO()): { start_date: string; end_date: string } {
    return { start_date: today, end_date: shiftISO(today, 30) };
}

/**
 * Drop start/end dates unless the Custom preset is active, so the URL stays
 * clean (`?date_preset=today` instead of `?date_preset=today&start_date=&end_date=`).
 * Keys are deleted (not just emptied) because the router re-runs
 * `validateSearch` when building the href, which would otherwise fill
 * defaults back in.
 */
export function stripDatesUnlessCustom(search: TodosSearchParams): TodosSearchParams {
    const next: TodosSearchParams = { ...search };
    switch (next.date_preset) {
        case DatePreset.Custom:
            if (!next.start_date) delete next.start_date;
            if (!next.end_date) delete next.end_date;
            return next;
        default:
            delete next.start_date;
            delete next.end_date;
            return next;
    }
}

/** Canonical `/todos` landing search — used for post-login redirects. */
export function todosHomeSearch(): TodosSearchParams {
    return stripDatesUnlessCustom(DEFAULT_SEARCH);
}
