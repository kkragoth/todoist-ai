import { AnimatePresence, motion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { cn } from "cn";
import { TodoRow } from "@/components/todos/TodoRow";
import { TodoBucket, bucketLabel, dayGroupLabel, type DayGroup } from "@/lib/todo-buckets";
import { isBucketCollapsed } from "@/lib/todos-view";
import { useTodosUiStore } from "@/stores/todos-ui-store";

export function TodoDayBucketSection({ bucket, days }: { bucket: TodoBucket; days: DayGroup[] }) {
    const collapsedBuckets = useTodosUiStore((s) => s.collapsedBuckets);
    const toggleBucketCollapsed = useTodosUiStore((s) => s.toggleBucketCollapsed);
    const flashIds = useTodosUiStore((s) => s.flashIds);
    const collapsed = isBucketCollapsed(collapsedBuckets, bucket);
    const total = days.reduce((n, day) => n + day.items.length, 0);

    return (
        <section className="mt-5">
            <button
                type="button"
                onClick={() => toggleBucketCollapsed(bucket)}
                aria-expanded={!collapsed}
                className="mb-2 flex items-center gap-2 rounded pl-0.5 text-left"
            >
                <ChevronRight
                    className={cn("size-3.5 text-muted-foreground transition-transform", !collapsed && "rotate-90")}
                />
                <span className="size-1.5 rounded-full bg-muted-foreground/50" />
                <span className="text-xs font-semibold text-muted-foreground">{bucketLabel(bucket)}</span>
                <span className="text-xs text-muted-foreground/60">{total}</span>
            </button>
            {!collapsed && (
                <div className="flex flex-col gap-3">
                    {days.map((day) => (
                        <div key={day.date ?? "no-date"}>
                            <p className="mb-1 pl-0.5 text-[11px] font-medium tracking-wide text-muted-foreground/80 uppercase">
                                {dayGroupLabel(day.date)}{" "}
                                <span className="text-muted-foreground/60">{day.items.length}</span>
                            </p>
                            <motion.ul
                                layout
                                className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
                            >
                                <AnimatePresence initial={false}>
                                    {day.items.map((todo) => (
                                        <TodoRow
                                            key={todo.id}
                                            todo={todo}
                                            flash={flashIds.includes(todo.id)}
                                            bucket={bucket}
                                        />
                                    ))}
                                </AnimatePresence>
                            </motion.ul>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
