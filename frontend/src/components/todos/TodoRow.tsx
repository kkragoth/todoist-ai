import { motion } from "motion/react";
import { useState } from "react";
import { Calendar } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { useArchiveTodo, usePatchTodo, useUnarchiveTodo } from "@/hooks/useTodos";
import type { Todo } from "@/lib/api";
import { TodoBucket, dueToneOf, hidesDueChip, isOverdueTone, isTodayTone, relativeDueLabel } from "@/lib/todo-buckets";
import { todayISO } from "@/lib/todos-filters";
import { isCompactDensity } from "@/lib/todos-view";
import { useTodosUiStore } from "@/stores/todos-ui-store";

function dueChipClass(dateISO: string, today: string): string {
    const tone = dueToneOf(dateISO, today);
    if (isOverdueTone(tone)) {
        return "border-transparent bg-red-500/15 text-red-600 dark:text-red-400";
    }
    if (isTodayTone(tone)) {
        return "border-transparent bg-amber-500/20 text-amber-700 dark:text-amber-400";
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
    const [pickingDate, setPickingDate] = useState(false);
    const density = useTodosUiStore((s) => s.density);
    const compact = isCompactDensity(density);
    const today = todayISO();

    const isCompleting = completingIds.includes(todo.id);
    const isDone = todo.completed || isCompleting;
    const chipHidden = bucket !== null && hidesDueChip(bucket);

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
                compact ? "min-h-[40px] px-3 py-1" : "min-h-[52px] px-4 py-2",
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
                    "flex size-[19px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] transition-colors",
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
                    className="truncate text-[14.5px] text-foreground"
                    initial={false}
                    animate={isDone ? { color: "var(--muted-foreground)" } : { color: "var(--foreground)" }}
                >
                    <motion.span
                        initial={false}
                        animate={{ textDecoration: isDone ? "line-through" : "none" }}
                        transition={{ duration: 0.3, delay: isCompleting ? 0.1 : 0 }}
                    >
                        {todo.task}
                    </motion.span>
                </motion.p>
            </div>
            {!todo.completed && !isCompleting && (
                <span className={cn("flex items-center gap-1", HOVER_REVEAL)}>
                    <button
                        type="button"
                        onClick={() => onReschedule(0)}
                        className="rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:border-amber-500 hover:text-amber-600"
                    >
                        Today
                    </button>
                    <button
                        type="button"
                        onClick={() => onReschedule(1)}
                        className="rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:border-amber-500 hover:text-amber-600"
                    >
                        Tomorrow
                    </button>
                    <button
                        type="button"
                        onClick={() => onReschedule(7)}
                        className="rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:border-amber-500 hover:text-amber-600"
                    >
                        +1wk
                    </button>
                </span>
            )}
            {pickingDate ? (
                <input
                    type="date"
                    autoFocus
                    className="h-7 rounded-md border border-input bg-card px-1.5 text-xs outline-none"
                    value={todo.todo_date}
                    onChange={(e) => {
                        if (e.target.value) {
                            patchMutation.mutate({ id: todo.id, update: { todo_date: e.target.value } });
                        }
                        setPickingDate(false);
                    }}
                    onBlur={() => setPickingDate(false)}
                    title="Pick a date"
                />
            ) : chipHidden ? (
                <button
                    type="button"
                    title={`${todo.todo_date} — click to reschedule`}
                    aria-label="Reschedule"
                    onClick={() => setPickingDate(true)}
                    className={cn(
                        "inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground hover:border-amber-500 hover:text-amber-600",
                        HOVER_REVEAL,
                    )}
                >
                    <Calendar className="size-3.5" />
                </button>
            ) : (
                <button
                    type="button"
                    title={`${todo.todo_date} — click to reschedule`}
                    onClick={() => setPickingDate(true)}
                    className={cn(
                        "rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
                        dueChipClass(todo.todo_date, today),
                    )}
                >
                    {relativeDueLabel(todo.todo_date, today)}
                </button>
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
