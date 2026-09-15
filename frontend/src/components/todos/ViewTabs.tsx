import { ViewTab } from "@/components/todos/ViewTab";
import { useTodosUiStore } from "@/stores/todos-ui-store";
import type { TodoView } from "@/lib/todos-view";

export function ViewTabs({ options }: { options: TodoView[] }) {
    const selected = useTodosUiStore((s) => s.view);
    const setView = useTodosUiStore((s) => s.setView);

    return (
        <>
            {options.map((option) => (
                <ViewTab key={option} option={option} selected={selected === option} onSelect={setView} />
            ))}
        </>
    );
}
