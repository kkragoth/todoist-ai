import { SortDirection, TodoBucket } from "@/lib/todo-buckets";

export enum TodoView {
    List = "list",
    Grouped = "grouped",
    GroupedByDay = "grouped_by_day",
}

export function parseTodoView(value: unknown): TodoView {
    switch (value) {
        case TodoView.List:
            return TodoView.List;
        case TodoView.GroupedByDay:
            return TodoView.GroupedByDay;
        case TodoView.Grouped:
            return TodoView.Grouped;
        default:
            return TodoView.Grouped;
    }
}

export function parseTodoViewStrict(value: unknown): TodoView | null {
    switch (value) {
        case TodoView.List:
            return TodoView.List;
        case TodoView.Grouped:
            return TodoView.Grouped;
        case TodoView.GroupedByDay:
            return TodoView.GroupedByDay;
        default:
            return null;
    }
}

export function viewLabel(view: TodoView): string {
    switch (view) {
        case TodoView.List:
            return "List";
        case TodoView.Grouped:
            return "Grouped";
        case TodoView.GroupedByDay:
            return "By day";
    }
}

export function isListView(view: TodoView): boolean {
    switch (view) {
        case TodoView.List:
            return true;
        case TodoView.Grouped:
        case TodoView.GroupedByDay:
            return false;
    }
}

export function isGroupedView(view: TodoView): boolean {
    switch (view) {
        case TodoView.Grouped:
            return true;
        case TodoView.List:
        case TodoView.GroupedByDay:
            return false;
    }
}

export function isGroupedByDayView(view: TodoView): boolean {
    switch (view) {
        case TodoView.GroupedByDay:
            return true;
        case TodoView.List:
        case TodoView.Grouped:
            return false;
    }
}

export enum ListSort {
    Asc = "asc",
    Desc = "desc",
}

export function parseListSort(value: unknown): ListSort | null {
    switch (value) {
        case ListSort.Asc:
            return ListSort.Asc;
        case ListSort.Desc:
            return ListSort.Desc;
        default:
            return null;
    }
}

export function sortLabel(sort: ListSort): string {
    switch (sort) {
        case ListSort.Asc:
            return "Oldest first";
        case ListSort.Desc:
            return "Newest first";
    }
}

export function isAscSort(sort: ListSort): boolean {
    switch (sort) {
        case ListSort.Asc:
            return true;
        case ListSort.Desc:
            return false;
    }
}

export function toggleListSort(sort: ListSort): ListSort {
    switch (sort) {
        case ListSort.Asc:
            return ListSort.Desc;
        case ListSort.Desc:
            return ListSort.Asc;
    }
}

export function toSortDirection(sort: ListSort): SortDirection {
    switch (sort) {
        case ListSort.Asc:
            return SortDirection.Asc;
        case ListSort.Desc:
            return SortDirection.Desc;
    }
}

export enum Density {
    Comfortable = "comfortable",
    Compact = "compact",
}

export function parseDensity(value: unknown): Density | null {
    switch (value) {
        case Density.Comfortable:
            return Density.Comfortable;
        case Density.Compact:
            return Density.Compact;
        default:
            return null;
    }
}

export function densityLabel(density: Density): string {
    switch (density) {
        case Density.Comfortable:
            return "Comfortable";
        case Density.Compact:
            return "Compact";
    }
}

export function isCompactDensity(density: Density): boolean {
    switch (density) {
        case Density.Compact:
            return true;
        case Density.Comfortable:
            return false;
    }
}

export function toggleDensity(density: Density): Density {
    switch (density) {
        case Density.Comfortable:
            return Density.Compact;
        case Density.Compact:
            return Density.Comfortable;
    }
}

export type CollapsedBuckets = Record<TodoBucket, boolean>;

export function defaultCollapsedBuckets(): CollapsedBuckets {
    return {
        [TodoBucket.Overdue]: false,
        [TodoBucket.Today]: false,
        [TodoBucket.Tomorrow]: false,
        [TodoBucket.ThisWeek]: false,
        [TodoBucket.Later]: false,
    };
}

export function isBucketCollapsed(collapsed: CollapsedBuckets, bucket: TodoBucket): boolean {
    switch (bucket) {
        case TodoBucket.Overdue:
            return collapsed[TodoBucket.Overdue];
        case TodoBucket.Today:
            return collapsed[TodoBucket.Today];
        case TodoBucket.Tomorrow:
            return collapsed[TodoBucket.Tomorrow];
        case TodoBucket.ThisWeek:
            return collapsed[TodoBucket.ThisWeek];
        case TodoBucket.Later:
            return collapsed[TodoBucket.Later];
    }
}
