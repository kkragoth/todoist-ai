import { useMemo } from "react";
import { useSearch } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { TodoRow } from "@/components/todos/TodoRow";
import { TodosHeader } from "@/components/todos/TodosHeader";
import { ApiError } from "@/lib/api";
import { useTodosQuery } from "@/hooks/useTodos";
import { TodoBucket, bucketLabel, groupTodos, sortTodos } from "@/lib/todo-buckets";
import { filterTodosFuzzy } from "@/lib/todo-search";
import { isDoneStatus, isOpenStatus, todayISO } from "@/lib/todos-filters";
import { useTodosUiStore } from "@/stores/todos-ui-store";

function bucketDot(bucket: TodoBucket): string {
    switch (bucket) {
        case TodoBucket.Overdue:
            return "bg-red-500";
        case TodoBucket.Today:
            return "bg-amber-500";
        case TodoBucket.Tomorrow:
        case TodoBucket.ThisWeek:
        case TodoBucket.Later:
            return "bg-muted-foreground/50";
    }
}

export function TodoList({ isAuthenticated, authChecked }: { isAuthenticated: boolean; authChecked: boolean }) {
    const search = useSearch({ from: "/todos" });
    const todosQuery = useTodosQuery(search, isAuthenticated && authChecked);
    const searchText = useTodosUiStore((s) => s.searchText);
    const flashIds = useTodosUiStore((s) => s.flashIds);
    const doneExpanded = useTodosUiStore((s) => s.doneExpanded);
    const setDoneExpanded = useTodosUiStore((s) => s.setDoneExpanded);
    const today = todayISO();

    const filtered = useMemo(() => {
        const todos = todosQuery.data ?? [];
        return filterTodosFuzzy(todos, searchText);
    }, [todosQuery.data, searchText]);

    const openGroups = useMemo(
        () =>
            groupTodos(
                filtered.filter((todo) => !todo.completed),
                today,
            ),
        [filtered, today],
    );
    const doneTodos = useMemo(() => sortTodos(filtered.filter((todo) => todo.completed)), [filtered]);
    const openCount = useMemo(() => openGroups.reduce((n, group) => n + group.items.length, 0), [openGroups]);

    const showOpen = !isDoneStatus(search.status);
    const showDoneSection = !isOpenStatus(search.status);
    const showDoneFlat = isDoneStatus(search.status) || searchText.trim() !== "";

    return (
        <div className="mt-4">
            <TodosHeader todos={filtered} />
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
            {showOpen &&
                openGroups.map((group) => (
                    <section key={group.bucket} className="mt-5">
                        <div className="mb-2 flex items-center gap-2 pl-0.5">
                            <span className={cn("size-1.5 rounded-full", bucketDot(group.bucket))} />
                            <span className="text-xs font-semibold text-muted-foreground">
                                {bucketLabel(group.bucket)}
                            </span>
                            <span className="text-xs text-muted-foreground/60">{group.items.length}</span>
                        </div>
                        <motion.ul layout className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                            <AnimatePresence initial={false}>
                                {group.items.map((todo) => (
                                    <TodoRow
                                        key={todo.id}
                                        todo={todo}
                                        flash={flashIds.includes(todo.id)}
                                        bucket={group.bucket}
                                    />
                                ))}
                            </AnimatePresence>
                        </motion.ul>
                    </section>
                ))}
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
