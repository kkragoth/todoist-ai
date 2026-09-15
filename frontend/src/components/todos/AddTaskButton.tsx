import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTodosUiStore } from "@/stores/todos-ui-store";

export function AddTaskButton() {
    const openAddModal = useTodosUiStore((s) => s.openAddModal);

    return (
        <Button
            type="button"
            size="sm"
            onClick={openAddModal}
            title="Add a task (press C)"
            aria-label="Add a task"
            className="border-border bg-white text-foreground hover:bg-muted dark:bg-background"
        >
            <Plus />
            Add task
        </Button>
    );
}
