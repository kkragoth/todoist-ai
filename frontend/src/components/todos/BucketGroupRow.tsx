import { TodoBucketSection } from "@/components/todos/TodoBucketSection";
import { TodoDayBucketSection } from "@/components/todos/TodoDayBucketSection";
import type { BucketWithDays } from "@/lib/todo-buckets";

export function BucketGroupRow({ group }: { group: BucketWithDays }) {
    if (group.days.length > 0) {
        return <TodoDayBucketSection bucket={group.bucket} days={group.days} />;
    }
    return <TodoBucketSection bucket={group.bucket} items={group.items} />;
}
