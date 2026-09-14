import { ArrowUpDown, Rows3 } from "lucide-react";
import { cn } from "cn";
import {
    Density,
    ListSort,
    TodoView,
    densityLabel,
    isGroupedByDayView,
    isGroupedView,
    isListView,
    sortLabel,
    toggleDensity,
    toggleListSort,
    viewLabel,
} from "@/lib/todos-view";
import { useTodosUiStore } from "@/stores/todos-ui-store";

const VIEW_OPTIONS = [TodoView.List, TodoView.Grouped, TodoView.GroupedByDay];

function nextDensity(density: Density): Density {
    return toggleDensity(density);
}

function nextSort(sort: ListSort): ListSort {
    return toggleListSort(sort);
}

export function TodosViewControls() {
    const view = useTodosUiStore((s) => s.view);
    const listSort = useTodosUiStore((s) => s.listSort);
    const density = useTodosUiStore((s) => s.density);
    const setView = useTodosUiStore((s) => s.setView);
    const setListSort = useTodosUiStore((s) => s.setListSort);
    const setDensity = useTodosUiStore((s) => s.setDensity);
    const expandAllBuckets = useTodosUiStore((s) => s.expandAllBuckets);
    const collapseAllBuckets = useTodosUiStore((s) => s.collapseAllBuckets);

    const showListControls = isListView(view);
    const showGroupControls = isGroupedView(view) || isGroupedByDayView(view);

    return (
        <div className="mt-3 flex flex-wrap items-center gap-2">
            <div
                role="tablist"
                aria-label="Todo layout"
                className="flex items-center gap-0.5 rounded-full border border-border bg-card p-0.5"
            >
                {VIEW_OPTIONS.map((option) => (
                    <button
                        key={option}
                        role="tab"
                        aria-selected={view === option}
                        type="button"
                        onClick={() => setView(option)}
                        className={cn(
                            "rounded-full px-3 py-1 text-[13px] font-medium transition-colors",
                            view === option
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {viewLabel(option)}
                    </button>
                ))}
            </div>
            {showListControls && (
                <span className="flex items-center gap-1.5">
                    <button
                        type="button"
                        title="Toggle sort direction"
                        onClick={() => setListSort(nextSort(listSort))}
                        className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                        <ArrowUpDown className="size-3.5" />
                        {sortLabel(listSort)}
                    </button>
                    <button
                        type="button"
                        title="Toggle row density"
                        onClick={() => setDensity(nextDensity(density))}
                        className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                        <Rows3 className="size-3.5" />
                        {densityLabel(density)}
                    </button>
                </span>
            )}
            {showGroupControls && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <button
                        type="button"
                        onClick={expandAllBuckets}
                        className="rounded px-1.5 py-0.5 hover:text-foreground"
                    >
                        Expand all
                    </button>
                    <span aria-hidden="true">·</span>
                    <button
                        type="button"
                        onClick={collapseAllBuckets}
                        className="rounded px-1.5 py-0.5 hover:text-foreground"
                    >
                        Collapse all
                    </button>
                </span>
            )}
        </div>
    );
}
