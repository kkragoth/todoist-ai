import { useMemo } from "react";
import { motion } from "motion/react";
import { cn } from "cn";
import { OverdueActions } from "@/components/todos/OverdueActions";
import { TodoArchiveButton } from "@/components/todos/TodoArchiveButton";
import { TodoCheckbox } from "@/components/todos/TodoCheckbox";
import { TodoDueField } from "@/components/todos/TodoDueField";
import { usePatchTodo } from "@/hooks/useTodos";
import type { Todo } from "@/lib/api";
import { addDaysISO } from "@/lib/dates";
import { TodoBucket, isOpenOverdueTodo } from "@/lib/todo-buckets";
import { todayISO } from "@/lib/todos-filters";
import { isCompactDensity } from "@/lib/todos-view";
import { useIsCompletingTodo, useIsFlashingTodo, useTodosUiStore } from "@/stores/todos-ui-store";

export function TodoRow({ todo, bucket }: { todo: Todo; bucket: TodoBucket | null }) {
    const patchMutation = usePatchTodo();
    const isCompleting = useIsCompletingTodo(todo.id);
    const flash = useIsFlashingTodo(todo.id);
    const markCompleting = useTodosUiStore((s) => s.markCompleting);
    const unmarkCompleting = useTodosUiStore((s) => s.unmarkCompleting);
    const density = useTodosUiStore((s) => s.density);
    const compact = isCompactDensity(density);
    const today = useMemo(() => todayISO(), []);

    const isDone = todo.completed || isCompleting;
    const showOverdueActions = isOpenOverdueTodo(todo, today) && !isCompleting;

    function onToggle() {
        if (isCompleting || patchMutation.isPending) return;
        if (!todo.completed) {
            // Play the strike-through + exit animation first, then persist.
            markCompleting(todo.id);
            window.setTimeout(() => {
                patchMutation.mutate(
                    { id: todo.id, update: { completed: true } },
                    { onSettled: () => unmarkCompleting(todo.id) },
                );
            }, 450);
            return;
        }
        patchMutation.mutate({ id: todo.id, update: { completed: false } });
    }

    function onReschedule(daysFromToday: number) {
        patchMutation.mutate({ id: todo.id, update: { todo_date: addDaysISO(today, daysFromToday) } });
    }

    return (
        <motion.li
            layout
            data-todo-id={todo.id}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={isDone ? { opacity: 0, x: 48 } : { opacity: 0, x: 24 }}
            transition={{ duration: 0.25 }}
            className={cn(
                "group flex items-center gap-3 border-b border-border/50 last:border-b-0 hover:bg-muted/50",
                compact ? "min-h-[40px] px-3 py-1" : "min-h-[48px] px-4 py-2",
                todo.archived && "opacity-60",
                flash && "todo-sse-flash",
            )}
            title={todo.archived ? "Archived" : undefined}
        >
            <TodoCheckbox done={isDone} completed={todo.completed} onToggle={onToggle} />
            <div className="min-w-0 flex-1">
                <motion.p
                    className={cn("truncate text-[14px]", isDone ? "text-todo-done" : "text-foreground")}
                    initial={false}
                    animate={isDone ? { color: "var(--todo-done)" } : { color: "var(--foreground)" }}
                >
                    <motion.span
                        initial={false}
                        animate={{ textDecoration: isDone ? "line-through" : "none" }}
                        transition={{ duration: 0.3, delay: isCompleting ? 0.1 : 0 }}
                        className={cn(isDone && "decoration-todo-done/60")}
                    >
                        {todo.task}
                    </motion.span>
                </motion.p>
            </div>
            {showOverdueActions && <OverdueActions onReschedule={onReschedule} />}
            <TodoDueField
                todoDate={todo.todo_date}
                completed={todo.completed}
                showOverdueActions={showOverdueActions}
                bucket={bucket}
                today={today}
                onChange={(iso) => patchMutation.mutate({ id: todo.id, update: { todo_date: iso } })}
            />
            <TodoArchiveButton id={todo.id} archived={todo.archived} />
        </motion.li>
    );
}
