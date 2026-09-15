import { useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { SegmentedControl } from "@/components/todos/SegmentedControl";
import { useTodosQuery } from "@/hooks/useTodos";
import { filterTodosFuzzy } from "@/lib/todo-search";
import {
    TodoStatus,
    parseTodoStatusStrict,
    statusLabel,
    stripDatesUnlessCustom,
    type TodosSearchParams,
} from "@/lib/todos-filters";
import { effectiveSearchForView } from "@/lib/todos-view";
import { useAuth } from "@/lib/auth";
import { useTodosUiStore } from "@/stores/todos-ui-store";

const STATUS_OPTIONS = [TodoStatus.All, TodoStatus.Open, TodoStatus.Done];

export function TodosFilters() {
    const search = useSearch({ from: "/todos" });
    const navigate = useNavigate({ from: "/todos" });
    const searchText = useTodosUiStore((s) => s.searchText);
    const setSearchText = useTodosUiStore((s) => s.setSearchText);
    const view = useTodosUiStore((s) => s.view);
    const { isAuthenticated } = useAuth();

    // Grouped views ignore the date preset, so counts do too.
    const effectiveSearch = effectiveSearchForView(search, view);
    const countsQuery = useTodosQuery({ ...effectiveSearch, status: TodoStatus.All }, isAuthenticated);
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

    function selectStatus(value: string) {
        const status = parseTodoStatusStrict(value);
        if (status) updateSearch({ status });
    }

    return (
        <div className="mt-2.5 flex flex-col gap-2.5">
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
