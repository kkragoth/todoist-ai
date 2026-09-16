import { cn } from "cn";
import { DateField } from "@/components/todos/DateField";
import { HOVER_REVEAL } from "@/components/todos/OverdueActions";
import { completedDueLabel, dueToneClass, hidesDueChip, relativeDueLabel, type TodoBucket } from "@/lib/todo-buckets";

export function TodoDueField({
    todoDate,
    completed,
    showOverdueActions,
    bucket,
    today,
    onChange,
}: {
    todoDate: string;
    completed: boolean;
    showOverdueActions: boolean;
    bucket: TodoBucket | null;
    today: string;
    onChange: (iso: string) => void;
}) {
    const chipHidden = bucket !== null && hidesDueChip(bucket);
    if (chipHidden) {
        return (
            <DateField
                iconOnly
                value={todoDate}
                onChange={onChange}
                label=""
                title={`${todoDate} — click to reschedule`}
                ariaLabel="Reschedule"
                className={HOVER_REVEAL}
            />
        );
    }
    return (
        <DateField
            value={todoDate}
            onChange={onChange}
            label={completed ? completedDueLabel(todoDate, today) : relativeDueLabel(todoDate, today)}
            title={`${todoDate} — click to reschedule`}
            ariaLabel="Reschedule"
            className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-medium",
                dueToneClass(todoDate, today, completed),
                // Overdue open rows swap the badge for quick actions on hover.
                showOverdueActions && "group-hover:hidden group-focus-within:hidden",
            )}
        />
    );
}
