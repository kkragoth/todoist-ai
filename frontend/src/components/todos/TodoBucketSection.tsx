import { AnimatePresence, motion } from "motion/react";
import { BucketHeader } from "@/components/todos/BucketHeader";
import { TodoRows } from "@/components/todos/TodoRows";
import type { Todo } from "@/lib/api";
import { TodoBucket, isAllDone } from "@/lib/todo-buckets";
import { useBucketCollapsed } from "@/stores/todos-ui-store";

export function TodoBucketSection({ bucket, items }: { bucket: TodoBucket; items: Todo[] }) {
    const collapsed = useBucketCollapsed(bucket);
    const allDone = isAllDone(items);

    return (
        <section className="mt-5">
            <BucketHeader bucket={bucket} count={items.length} allDone={allDone} />
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
