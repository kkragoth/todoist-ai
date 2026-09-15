import { TodoBucketSection } from "@/components/todos/TodoBucketSection";
import type { BucketGroup } from "@/lib/todo-buckets";

export function TodoBucketSections({ groups }: { groups: BucketGroup[] }) {
    return (
        <>
            {groups.map((group) => (
                <TodoBucketSection key={group.bucket} bucket={group.bucket} items={group.items} />
            ))}
        </>
    );
}
