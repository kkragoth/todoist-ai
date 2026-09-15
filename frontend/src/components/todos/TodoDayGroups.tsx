import { TodoDayGroup } from "@/components/todos/TodoDayGroup";
import type { DayGroup, TodoBucket } from "@/lib/todo-buckets";

export function TodoDayGroups({ bucket, days }: { bucket: TodoBucket; days: DayGroup[] }) {
    return (
        <>
            {days.map((day) => (
                <TodoDayGroup key={day.date ?? "no-date"} bucket={bucket} day={day} />
            ))}
        </>
    );
}
