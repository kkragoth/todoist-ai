import { BucketGroupRow } from "@/components/todos/BucketGroupRow";
import type { BucketWithDays } from "@/lib/todo-buckets";

export function BucketGroupRows({ groups }: { groups: BucketWithDays[] }) {
    return (
        <>
            {groups.map((group) => (
                <BucketGroupRow key={group.bucket} group={group} />
            ))}
        </>
    );
}
