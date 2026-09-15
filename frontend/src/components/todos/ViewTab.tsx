import { cn } from "cn";
import { viewLabel, type TodoView } from "@/lib/todos-view";

export function ViewTab({
    option,
    selected,
    onSelect,
}: {
    option: TodoView;
    selected: boolean;
    onSelect: (view: TodoView) => void;
}) {
    return (
        <button
            role="tab"
            aria-selected={selected}
            type="button"
            onClick={() => onSelect(option)}
            className={cn(
                "rounded-full px-3 py-1 text-[13px] font-medium transition-colors",
                selected ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
        >
            {viewLabel(option)}
        </button>
    );
}
