import { useMemo } from "react";
import { useSearch } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { BucketGroupRows } from "@/components/todos/BucketGroupRows";
import { DoneSection } from "@/components/todos/DoneSection";
import { TodoBucketSections } from "@/components/todos/TodoBucketSections";
import { TodoRows } from "@/components/todos/TodoRows";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { useTodosQuery } from "@/hooks/useTodos";
import { groupTodos, groupTodosByDay, sortTodos } from "@/lib/todo-buckets";
import { filterTodosFuzzy } from "@/lib/todo-search";
import { mergeBucketGroups, mergeDayGroups } from "@/lib/todo-groups-merge";
import { isDoneStatus, isOpenStatus, todayISO } from "@/lib/todos-filters";
import { effectiveSearchForView, isGroupedByDayView, isListView, toSortDirection } from "@/lib/todos-view";
import { useAuth } from "@/lib/auth";
import { useTodosUiStore } from "@/stores/todos-ui-store";

export function TodoList() {
    const { isAuthenticated, isLoading } = useAuth();
    const search = useSearch({ from: "/todos" });
    const view = useTodosUiStore((s) => s.view);
    const effectiveSearch = effectiveSearchForView(search, view);
    const todosQuery = useTodosQuery(effectiveSearch, isAuthenticated && !isLoading);
    const searchText = useTodosUiStore((s) => s.searchText);
    const listSort = useTodosUiStore((s) => s.listSort);
    const today = useMemo(() => todayISO(), []);

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
                    Nothing here. Use Add task to create your first todo.
                </p>
            )}
            {showOpen && showList && flatOpen.length > 0 && (
                <section className="mt-5">
                    <motion.ul layout className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                        <AnimatePresence initial={false}>
                            <TodoRows todos={flatOpen} bucket={null} />
                        </AnimatePresence>
                    </motion.ul>
                </section>
            )}
            {!showList && !showByDay && <TodoBucketSections groups={openGroups} />}
            {!showList && showByDay && <BucketGroupRows groups={openGroupsByDay} />}
            {showDoneSection && <DoneSection doneTodos={doneTodos} forceFlat={showDoneFlat} />}
        </div>
    );
}
