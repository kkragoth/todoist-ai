import { ViewTab } from "@/components/todos/ViewTab";
import type { TodoView } from "@/lib/todos-view";

export function ViewTabs({
    options,
    selected,
    onSelect,
}: {
    options: TodoView[];
    selected: TodoView;
    onSelect: (view: TodoView) => void;
}) {
    return (
        <>
            {options.map((option) => (
                <ViewTab key={option} option={option} selected={selected === option} onSelect={onSelect} />
            ))}
        </>
    );
}
