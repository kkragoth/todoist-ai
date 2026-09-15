import { ChevronRight } from "lucide-react";
import { cn } from "cn";
import { TodoDayGroups } from "@/components/todos/TodoDayGroups";
import { TodoBucket, bucketLabel, type DayGroup } from "@/lib/todo-buckets";
import { isBucketCollapsed } from "@/lib/todos-view";
import { useTodosUiStore } from "@/stores/todos-ui-store";

export function TodoDayBucketSection({ bucket, days }: { bucket: TodoBucket; days: DayGroup[] }) {
    const collapsedBuckets = useTodosUiStore((s) => s.collapsedBuckets);
    const toggleBucketCollapsed = useTodosUiStore((s) => s.toggleBucketCollapsed);
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
                    <TodoDayGroups bucket={bucket} days={days} />
                </div>
            )}
        </section>
    );
}
