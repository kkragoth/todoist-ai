import { motion } from "motion/react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/todos/DateField";
import { useArchiveTodo, usePatchTodo, useUnarchiveTodo } from "@/hooks/useTodos";
import type { Todo } from "@/lib/api";
import {
    TodoBucket,
    completedDueLabel,
    dueToneOf,
    hidesDueChip,
    isOpenOverdueTodo,
    isOverdueTone,
    isTodayTone,
    relativeDueLabel,
} from "@/lib/todo-buckets";
import { todayISO } from "@/lib/todos-filters";
import { isCompactDensity } from "@/lib/todos-view";
import { useTodosUiStore } from "@/stores/todos-ui-store";

function dueChipClass(dateISO: string, today: string, completed: boolean): string {
    // Completed tasks never render overdue (red) styling — neutral only.
    if (completed) {
        return "border-transparent bg-muted text-muted-foreground";
    }
    const tone = dueToneOf(dateISO, today);
    if (isOverdueTone(tone)) {
        return "border-transparent bg-red-500/15 text-red-600 dark:border-overdue-border dark:bg-overdue-dim dark:text-overdue-text";
    }
    if (isTodayTone(tone)) {
        return "border-transparent bg-amber-500/20 text-amber-700 dark:border-transparent dark:bg-gold/15 dark:text-gold";
    }
    return "border-transparent bg-muted text-muted-foreground";
}

function shiftISO(iso: string, days: number): string {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

/** Hover-revealed controls keep their layout space and cross-fade in/out instead of popping the row. */
const HOVER_REVEAL =
    "pointer-events-none opacity-0 transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 pointer-coarse:pointer-events-auto pointer-coarse:opacity-100";

export function TodoRow({ todo, flash, bucket }: { todo: Todo; flash: boolean; bucket: TodoBucket | null }) {
    const patchMutation = usePatchTodo();
    const archiveMutation = useArchiveTodo();
    const unarchiveMutation = useUnarchiveTodo();
    const completingIds = useTodosUiStore((s) => s.completingIds);
    const markCompleting = useTodosUiStore((s) => s.markCompleting);
    const unmarkCompleting = useTodosUiStore((s) => s.unmarkCompleting);
    const density = useTodosUiStore((s) => s.density);
    const compact = isCompactDensity(density);
    const today = todayISO();

    const isCompleting = completingIds.includes(todo.id);
    const isDone = todo.completed || isCompleting;
    const chipHidden = bucket !== null && hidesDueChip(bucket);
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
        patchMutation.mutate({ id: todo.id, update: { todo_date: shiftISO(today, daysFromToday) } });
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
            <button
                type="button"
                onClick={onToggle}
                aria-label={todo.completed ? "Mark as open" : "Mark as done"}
                className={cn(
                    "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] transition-colors",
                    isDone ? "border-muted-foreground bg-muted-foreground" : "border-border hover:border-foreground/40",
                )}
            >
                {isDone && (
                    <svg viewBox="0 0 12 12" fill="none" className="size-[11px]">
                        <path
                            d="M2 6l2.5 2.5L10 3"
                            stroke="var(--card)"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                )}
            </button>
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
            {showOverdueActions && (
                <span
                    className={cn(
                        "items-center gap-1",
                        HOVER_REVEAL,
                        "hidden group-hover:flex group-focus-within:flex",
                    )}
                >
                    <button
                        type="button"
                        onClick={() => onReschedule(0)}
                        className="rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:border-amber-500 hover:text-amber-600 dark:hover:border-gold dark:hover:text-gold"
                    >
                        → Today
                    </button>
                    <button
                        type="button"
                        onClick={() => onReschedule(1)}
                        className="rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:border-amber-500 hover:text-amber-600 dark:hover:border-gold dark:hover:text-gold"
                    >
                        → Tomorrow
                    </button>
                </span>
            )}
            {chipHidden ? (
                <DateField
                    iconOnly
                    value={todo.todo_date}
                    onChange={(iso) => patchMutation.mutate({ id: todo.id, update: { todo_date: iso } })}
                    label=""
                    title={`${todo.todo_date} — click to reschedule`}
                    ariaLabel="Reschedule"
                    className={HOVER_REVEAL}
                />
            ) : (
                <DateField
                    value={todo.todo_date}
                    onChange={(iso) => patchMutation.mutate({ id: todo.id, update: { todo_date: iso } })}
                    label={
                        todo.completed
                            ? completedDueLabel(todo.todo_date, today)
                            : relativeDueLabel(todo.todo_date, today)
                    }
                    title={`${todo.todo_date} — click to reschedule`}
                    ariaLabel="Reschedule"
                    className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-medium",
                        dueChipClass(todo.todo_date, today, todo.completed),
                        // Overdue open rows swap the badge for quick actions on hover.
                        showOverdueActions && "group-hover:hidden group-focus-within:hidden",
                    )}
                />
            )}
            {todo.archived ? (
                <Button
                    variant="outline"
                    size="xs"
                    className={cn("bg-card", HOVER_REVEAL)}
                    onClick={() => unarchiveMutation.mutate(todo.id)}
                >
                    Restore
                </Button>
            ) : (
                <Button
                    variant="destructive"
                    size="xs"
                    className={HOVER_REVEAL}
                    onClick={() => archiveMutation.mutate(todo.id)}
                >
                    Delete
                </Button>
            )}
        </motion.li>
    );
}
