import { ArrowUpDown, Rows3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuickDateFilter } from "@/components/todos/QuickDateFilter";
import { ViewTabs } from "@/components/todos/ViewTabs";
import {
    TodoView,
    densityLabel,
    isGroupedByDayView,
    isGroupedView,
    isListView,
    sortLabel,
    toggleDensity,
    toggleListSort,
} from "@/lib/todos-view";
import { useTodosUiStore } from "@/stores/todos-ui-store";

const VIEW_OPTIONS = [TodoView.List, TodoView.Grouped];

export function TodosViewControls() {
    const view = useTodosUiStore((s) => s.view);
    const listSort = useTodosUiStore((s) => s.listSort);
    const density = useTodosUiStore((s) => s.density);
    const setListSort = useTodosUiStore((s) => s.setListSort);
    const setDensity = useTodosUiStore((s) => s.setDensity);
    const expandAllBuckets = useTodosUiStore((s) => s.expandAllBuckets);
    const collapseAllBuckets = useTodosUiStore((s) => s.collapseAllBuckets);

    const showListControls = isListView(view);
    const showGroupControls = isGroupedView(view) || isGroupedByDayView(view);

    return (
        <div className="flex flex-wrap items-center gap-2">
            <div
                role="tablist"
                aria-label="Todo layout"
                className="flex items-center gap-0.5 rounded-full border border-border bg-card p-0.5"
            >
                <ViewTabs options={VIEW_OPTIONS} />
            </div>
            {showListControls && <QuickDateFilter />}
            {showListControls && (
                <span className="flex items-center gap-1.5">
                    <button
                        type="button"
                        title="Toggle sort direction"
                        onClick={() => setListSort(toggleListSort(listSort))}
                        className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                        <ArrowUpDown className="size-3.5" />
                        {sortLabel(listSort)}
                    </button>
                    <button
                        type="button"
                        title="Toggle row density"
                        onClick={() => setDensity(toggleDensity(density))}
                        className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                        <Rows3 className="size-3.5" />
                        {densityLabel(density)}
                    </button>
                </span>
            )}
            {showGroupControls && (
                <span className="flex items-center gap-1.5">
                    <Button type="button" variant="outline" size="xs" onClick={expandAllBuckets}>
                        Expand all
                    </Button>
                    <Button type="button" variant="outline" size="xs" onClick={collapseAllBuckets}>
                        Collapse all
                    </Button>
                </span>
            )}
        </div>
    );
}
