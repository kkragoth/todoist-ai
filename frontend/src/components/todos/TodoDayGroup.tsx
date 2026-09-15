import { AnimatePresence, motion } from "motion/react";
import { TodoRows } from "@/components/todos/TodoRows";
import { TodoBucket, dayGroupLabel, type DayGroup } from "@/lib/todo-buckets";

export function TodoDayGroup({ bucket, day }: { bucket: TodoBucket; day: DayGroup }) {
    return (
        <div>
            <p className="mb-1 pl-0.5 text-[11px] font-medium tracking-wide text-muted-foreground/80 uppercase">
                {dayGroupLabel(day.date)} <span className="text-muted-foreground/60">{day.items.length}</span>
            </p>
            <motion.ul layout className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                <AnimatePresence initial={false}>
                    <TodoRows todos={day.items} bucket={bucket} />
                </AnimatePresence>
            </motion.ul>
        </div>
    );
}
