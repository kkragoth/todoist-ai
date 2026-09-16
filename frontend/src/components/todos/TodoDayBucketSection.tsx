import { BucketHeader } from "@/components/todos/BucketHeader";
import { TodoDayGroups } from "@/components/todos/TodoDayGroups";
import { TodoBucket, type DayGroup } from "@/lib/todo-buckets";
import { useBucketCollapsed } from "@/stores/todos-ui-store";

export function TodoDayBucketSection({ bucket, days }: { bucket: TodoBucket; days: DayGroup[] }) {
    const collapsed = useBucketCollapsed(bucket);
    const total = days.reduce((n, day) => n + day.items.length, 0);

    return (
        <section className="mt-5">
            <BucketHeader bucket={bucket} count={total} />
            {!collapsed && (
                <div className="flex flex-col gap-3">
                    <TodoDayGroups bucket={bucket} days={days} />
                </div>
            )}
        </section>
    );
}
