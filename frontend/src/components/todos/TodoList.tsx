import { useMemo } from "react";
import { useSearch } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { TodoRow } from "@/components/todos/TodoRow";
import { TodoBucketSection } from "@/components/todos/TodoBucketSection";
import { TodoDayBucketSection } from "@/components/todos/TodoDayBucketSection";
import { ApiError } from "@/lib/api";
import { useTodosQuery } from "@/hooks/useTodos";
import { groupTodos, groupTodosByDay, sortTodos, type BucketGroup, type BucketWithDays } from "@/lib/todo-buckets";
import { filterTodosFuzzy } from "@/lib/todo-search";
import { isDoneStatus, isOpenStatus, todayISO } from "@/lib/todos-filters";
import { isGroupedByDayView, isListView, toSortDirection } from "@/lib/todos-view";
import { useTodosUiStore } from "@/stores/todos-ui-store";

/** In grouped views done todos render inline at the end of their own bucket. */
function mergeBucketGroups(open: BucketGroup[], done: BucketGroup[]): BucketGroup[] {
    const doneByBucket = new Map(done.map((group) => [group.bucket, group.items]));
    const merged = open.map((group) => ({
        bucket: group.bucket,
        items: [...group.items, ...(doneByBucket.get(group.bucket) ?? [])],
    }));
    const openBuckets = new Set(open.map((group) => group.bucket));
    for (const group of done) {
        if (!openBuckets.has(group.bucket)) {
            merged.push(group);
        }
    }
    return merged;
}

/** Same inline-done merge for the by-day view (week/later split per date). */
function mergeDayGroups(open: BucketWithDays[], done: BucketWithDays[]): BucketWithDays[] {
    const doneByBucket = new Map(done.map((group) => [group.bucket, group]));
    const merged: BucketWithDays[] = open.map((group) => {
        const match = doneByBucket.get(group.bucket);
        if (!match) return group;
        if (group.days.length > 0 || match.days.length > 0) {
            const byDate = new Map<string | null, BucketWithDays["days"][number]>();
            for (const day of [...group.days, ...match.days]) {
                const existing = byDate.get(day.date);
                if (existing) {
                    existing.items.push(...day.items);
                } else {
                    byDate.set(day.date, { date: day.date, items: [...day.items] });
                }
            }
            const days = [...byDate.values()].sort((a, b) => {
                if (a.date === b.date) return 0;
                if (a.date === null) return 1;
                if (b.date === null) return -1;
                return a.date < b.date ? -1 : 1;
            });
            return { bucket: group.bucket, items: [], days };
        }
        return { bucket: group.bucket, items: [...group.items, ...match.items], days: [] };
    });
    const openBuckets = new Set(open.map((group) => group.bucket));
    for (const group of done) {
        if (!openBuckets.has(group.bucket)) {
            merged.push(group);
        }
    }
    return merged;
}

export function TodoList({ isAuthenticated, authChecked }: { isAuthenticated: boolean; authChecked: boolean }) {
    const search = useSearch({ from: "/todos" });
    const todosQuery = useTodosQuery(search, isAuthenticated && authChecked);
    const searchText = useTodosUiStore((s) => s.searchText);
    const flashIds = useTodosUiStore((s) => s.flashIds);
    const doneExpanded = useTodosUiStore((s) => s.doneExpanded);
    const setDoneExpanded = useTodosUiStore((s) => s.setDoneExpanded);
    const view = useTodosUiStore((s) => s.view);
    const listSort = useTodosUiStore((s) => s.listSort);
    const today = todayISO();

    const filtered = useMemo(() => {
        const todos = todosQuery.data ?? [];
        return filterTodosFuzzy(todos, searchText);
    }, [todosQuery.data, searchText]);

    const openTodos = useMemo(() => filtered.filter((todo) => !todo.completed), [filtered]);
    const direction = toSortDirection(listSort);

    const flatOpen = useMemo(() => sortTodos(openTodos, direction), [openTodos, direction]);
    const doneTodos = useMemo(() => sortTodos(filtered.filter((todo) => todo.completed)), [filtered]);
    const openGroups = useMemo(() => {
        const open = groupTodos(openTodos, today);
        if (isListView(view)) return open;
        return mergeBucketGroups(open, groupTodos(doneTodos, today));
    }, [openTodos, doneTodos, today, view]);
    const openGroupsByDay = useMemo(() => {
        const open = groupTodosByDay(openTodos, today);
        if (isListView(view)) return open;
        return mergeDayGroups(open, groupTodosByDay(doneTodos, today));
    }, [openTodos, doneTodos, today, view]);
    const openCount = openTodos.length;

    const showOpen = !isDoneStatus(search.status);
    const showList = isListView(view);
    const showByDay = isGroupedByDayView(view);
    // Grouped views render done inline inside each bucket; only the flat list
    // keeps a separate Done section.
    const showDoneSection = !isOpenStatus(search.status) && showList;
    const showDoneFlat = isDoneStatus(search.status) || searchText.trim() !== "";

    return (
        <div className="mt-4">
            {searchText.trim() && todosQuery.isSuccess && (
                <p className="mt-1 text-xs text-muted-foreground">
                    {filtered.length} match{filtered.length === 1 ? "" : "es"} for “{searchText.trim()}”
                </p>
            )}
            {todosQuery.isPending && <p className="mt-4 text-sm text-muted-foreground">Loading todos…</p>}
            {todosQuery.isError && (
                <p className="mt-4 text-sm text-destructive">
                    {todosQuery.error instanceof ApiError ? todosQuery.error.message : "Could not load todos."}{" "}
                    <Button variant="link" size="sm" onClick={() => todosQuery.refetch()}>
                        Retry
                    </Button>
                </p>
            )}
            {todosQuery.isSuccess && filtered.length === 0 && (
                <p className="mt-4 rounded-xl border border-dashed bg-card py-8 text-center text-sm text-muted-foreground">
                    Nothing here. Add your first todo above.
                </p>
            )}
            {showOpen && showList && flatOpen.length > 0 && (
                <section className="mt-5">
                    <motion.ul layout className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                        <AnimatePresence initial={false}>
                            {flatOpen.map((todo) => (
                                <TodoRow key={todo.id} todo={todo} flash={flashIds.includes(todo.id)} bucket={null} />
                            ))}
                        </AnimatePresence>
                    </motion.ul>
                </section>
            )}
            {!showList &&
                !showByDay &&
                openGroups.map((group) => (
                    <TodoBucketSection key={group.bucket} bucket={group.bucket} items={group.items} />
                ))}
            {!showList &&
                showByDay &&
                openGroupsByDay.map((group) =>
                    group.days.length > 0 ? (
                        <TodoDayBucketSection key={group.bucket} bucket={group.bucket} days={group.days} />
                    ) : (
                        <TodoBucketSection key={group.bucket} bucket={group.bucket} items={group.items} />
                    ),
                )}
            {showOpen && openCount === 0 && todosQuery.isSuccess && filtered.length > 0 && (
                <p className="mt-4 pl-0.5 text-sm text-muted-foreground">
                    Nothing open in this view — add something above, or clear the filters.
                </p>
            )}
            {showDoneSection && doneTodos.length > 0 && (
                <section className="mt-5">
                    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                        {showDoneFlat ? (
                            <ul>
                                {doneTodos.map((todo) => (
                                    <TodoRow
                                        key={todo.id}
                                        todo={todo}
                                        flash={flashIds.includes(todo.id)}
                                        bucket={null}
                                    />
                                ))}
                            </ul>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    onClick={() => setDoneExpanded(!doneExpanded)}
                                    className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground"
                                >
                                    <ChevronRight
                                        className={cn("size-4 transition-transform", doneExpanded && "rotate-90")}
                                    />
                                    Done ({doneTodos.length})
                                </button>
                                {doneExpanded && (
                                    <ul className="border-t border-border/50">
                                        <AnimatePresence initial={false}>
                                            {doneTodos.map((todo) => (
                                                <TodoRow
                                                    key={todo.id}
                                                    todo={todo}
                                                    flash={flashIds.includes(todo.id)}
                                                    bucket={null}
                                                />
                                            ))}
                                        </AnimatePresence>
                                    </ul>
                                )}
                            </>
                        )}
                    </div>
                </section>
            )}
        </div>
    );
}
