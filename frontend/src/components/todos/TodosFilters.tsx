import { useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { DateField } from "@/components/todos/DateField";
import { SegmentedControl } from "@/components/todos/SegmentedControl";
import { useTodosQuery } from "@/hooks/useTodos";
import { filterTodosFuzzy } from "@/lib/todo-search";
import { formatDateButtonLabel } from "@/lib/dates";
import {
    DatePreset,
    TodoStatus,
    datePresetLabel,
    defaultCustomDateRange,
    parseDatePresetStrict,
    parseTodoStatusStrict,
    statusLabel,
    stripDatesUnlessCustom,
    type TodosSearchParams,
} from "@/lib/todos-filters";
import { useAuth } from "@/lib/auth";
import { useTodosUiStore } from "@/stores/todos-ui-store";

const DATE_PRESETS = [
    DatePreset.All,
    DatePreset.Overdue,
    DatePreset.Today,
    DatePreset.Tomorrow,
    DatePreset.Week,
    DatePreset.Later,
    DatePreset.Custom,
];

const STATUS_OPTIONS = [TodoStatus.All, TodoStatus.Open, TodoStatus.Done];

export function TodosFilters() {
    const search = useSearch({ from: "/todos" });
    const navigate = useNavigate({ from: "/todos" });
    const searchText = useTodosUiStore((s) => s.searchText);
    const setSearchText = useTodosUiStore((s) => s.setSearchText);
    const { isAuthenticated } = useAuth();

    const countsQuery = useTodosQuery({ ...search, status: TodoStatus.All }, isAuthenticated);
    const counts = useMemo(() => {
        const filtered = filterTodosFuzzy(countsQuery.data ?? [], searchText);
        const open = filtered.filter((todo) => !todo.completed).length;
        const done = filtered.length - open;
        return { all: filtered.length, open, done };
    }, [countsQuery.data, searchText]);

    function statusCount(status: TodoStatus): number {
        switch (status) {
            case TodoStatus.All:
                return counts.all;
            case TodoStatus.Open:
                return counts.open;
            case TodoStatus.Done:
                return counts.done;
        }
    }

    function updateSearch(patch: Partial<TodosSearchParams>) {
        navigate({ to: "/todos", search: stripDatesUnlessCustom({ ...search, ...patch }) });
    }

    function goToPreset(preset: DatePreset) {
        if (preset === DatePreset.Custom && !search.start_date && !search.end_date) {
            updateSearch({ date_preset: preset, ...defaultCustomDateRange() });
            return;
        }
        updateSearch({ date_preset: preset });
    }

    function selectPreset(value: string) {
        const preset = parseDatePresetStrict(value);
        if (preset) goToPreset(preset);
    }

    function selectStatus(value: string) {
        const status = parseTodoStatusStrict(value);
        if (status) updateSearch({ status });
    }

    return (
        <div className="mt-4 flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
                <SegmentedControl
                    label="Filter by date"
                    items={DATE_PRESETS.map((preset) => ({ value: preset, label: datePresetLabel(preset) }))}
                    selected={search.date_preset}
                    onSelect={selectPreset}
                />
                {search.date_preset === DatePreset.Custom && (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <DateField
                            value={search.start_date ?? ""}
                            onChange={(iso) => updateSearch({ start_date: iso })}
                            label={formatDateButtonLabel(search.start_date ?? "", "Start")}
                            ariaLabel="Start date"
                        />
                        <span>→</span>
                        <DateField
                            value={search.end_date ?? ""}
                            onChange={(iso) => updateSearch({ end_date: iso })}
                            label={formatDateButtonLabel(search.end_date ?? "", "End")}
                            ariaLabel="End date"
                        />
                    </span>
                )}
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
                <label className="flex h-8 min-w-32 flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm shadow-sm focus-within:ring-2 focus-within:ring-ring/50">
                    <Search className="size-3.5 shrink-0 text-muted-foreground" />
                    <input
                        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground/60"
                        placeholder="Fuzzy search tasks…"
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                    />
                    {searchText.trim() && (
                        <button
                            type="button"
                            className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => setSearchText("")}
                        >
                            Clear
                        </button>
                    )}
                </label>
                <SegmentedControl
                    label="Filter by status"
                    items={STATUS_OPTIONS.map((status) => ({
                        value: status,
                        label: `${statusLabel(status)} (${statusCount(status)})`,
                    }))}
                    selected={search.status}
                    onSelect={selectStatus}
                />
                <label className="flex shrink-0 items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground">
                    <input
                        type="checkbox"
                        checked={search.archived}
                        onChange={(e) => updateSearch({ archived: e.target.checked })}
                    />
                    Archived
                </label>
            </div>
        </div>
    );
}
