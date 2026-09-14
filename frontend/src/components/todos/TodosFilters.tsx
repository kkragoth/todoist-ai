import { useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { useTodosQuery } from "@/hooks/useTodos";
import { filterTodosFuzzy } from "@/lib/todo-search";
import {
    DatePreset,
    TodoStatus,
    datePresetLabel,
    defaultCustomDateRange,
    statusLabel,
    stripDatesUnlessCustom,
    type TodosSearchParams,
} from "@/lib/todos-filters";
import { useAuth } from "@/lib/auth";
import { useTodosUiStore } from "@/stores/todos-ui-store";

const STATUS_OPTIONS = [TodoStatus.All, TodoStatus.Open, TodoStatus.Done];

const PRESET_OPTIONS = [
    DatePreset.All,
    DatePreset.Overdue,
    DatePreset.Today,
    DatePreset.Tomorrow,
    DatePreset.Week,
    DatePreset.Later,
    DatePreset.Custom,
];

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

    return (
        <div className="mt-4 flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
                {PRESET_OPTIONS.map((preset) => (
                    <button
                        key={preset}
                        type="button"
                        onClick={() => goToPreset(preset)}
                        className={cn(
                            "rounded-full border px-3 py-1 text-[13px] font-medium transition-colors",
                            search.date_preset === preset
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                        )}
                    >
                        {datePresetLabel(preset)}
                    </button>
                ))}
                {search.date_preset === DatePreset.Custom && (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <input
                            type="date"
                            aria-label="Start date"
                            className="h-7 rounded-md border border-input bg-card px-2 text-xs outline-none"
                            value={search.start_date ?? ""}
                            onChange={(e) => updateSearch({ start_date: e.target.value })}
                        />
                        <span>→</span>
                        <input
                            type="date"
                            aria-label="End date"
                            className="h-7 rounded-md border border-input bg-card px-2 text-xs outline-none"
                            value={search.end_date ?? ""}
                            onChange={(e) => updateSearch({ end_date: e.target.value })}
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
                <span className="flex shrink-0 items-center gap-1.5">
                    {STATUS_OPTIONS.map((option) => (
                        <Button
                            key={option}
                            variant={search.status === option ? "default" : "outline"}
                            size="sm"
                            className={cn(search.status !== option && "rounded-full bg-card")}
                            onClick={() => updateSearch({ status: option })}
                        >
                            {statusLabel(option)} ({statusCount(option)})
                        </Button>
                    ))}
                </span>
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
