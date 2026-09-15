import { AnimatePresence, motion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { cn } from "cn";
import { TodoRows } from "@/components/todos/TodoRows";
import type { Todo } from "@/lib/api";
import { TodoBucket, bucketLabel, isAllDone } from "@/lib/todo-buckets";
import { isBucketCollapsed } from "@/lib/todos-view";
import { useTodosUiStore } from "@/stores/todos-ui-store";

function bucketDot(bucket: TodoBucket, allDone: boolean): string {
    // A group of only completed tasks never renders the red overdue dot.
    if (allDone) return "bg-muted-foreground/50";
    switch (bucket) {
        case TodoBucket.Overdue:
            return "bg-red-500 dark:bg-overdue";
        case TodoBucket.Today:
            return "bg-amber-500 dark:bg-gold";
        case TodoBucket.Tomorrow:
        case TodoBucket.ThisWeek:
        case TodoBucket.Later:
            return "bg-muted-foreground/50";
    }
}

export function TodoBucketSection({ bucket, items }: { bucket: TodoBucket; items: Todo[] }) {
    const collapsedBuckets = useTodosUiStore((s) => s.collapsedBuckets);
    const toggleBucketCollapsed = useTodosUiStore((s) => s.toggleBucketCollapsed);
    const collapsed = isBucketCollapsed(collapsedBuckets, bucket);
    const allDone = isAllDone(items);

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
                <span className={cn("size-1.5 rounded-full", bucketDot(bucket, allDone))} />
                <span className="text-xs font-semibold text-muted-foreground">{bucketLabel(bucket)}</span>
                <span className="text-xs text-muted-foreground/60">{items.length}</span>
            </button>
            {!collapsed && (
                <motion.ul layout className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                    <AnimatePresence initial={false}>
                        <TodoRows todos={items} bucket={bucket} />
                    </AnimatePresence>
                </motion.ul>
            )}
        </section>
    );
}
