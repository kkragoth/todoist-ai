import { Button } from "@/components/ui/button";
import { useCreateTodo } from "@/hooks/useTodos";
import { useTodosUiStore } from "@/stores/todos-ui-store";

export function TodoCreateForm() {
    const newTask = useTodosUiStore((s) => s.newTask);
    const newDate = useTodosUiStore((s) => s.newDate);
    const formError = useTodosUiStore((s) => s.formError);
    const setNewTask = useTodosUiStore((s) => s.setNewTask);
    const setNewDate = useTodosUiStore((s) => s.setNewDate);
    const createMutation = useCreateTodo();

    function onAdd(e: React.FormEvent) {
        e.preventDefault();
        const task = newTask.trim();
        if (!task) return;
        createMutation.mutate({ task, todo_date: newDate || null });
    }

    return (
        <div>
            <form onSubmit={onAdd} className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input
                    className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    placeholder="What needs doing?"
                    value={newTask}
                    onChange={(e) => setNewTask(e.target.value)}
                />
                <input
                    type="date"
                    className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                />
                <Button type="submit" disabled={createMutation.isPending || !newTask.trim()}>
                    {createMutation.isPending ? "Adding…" : "Add"}
                </Button>
            </form>
            {formError && <p className="mt-2 text-sm text-destructive">{formError}</p>}
        </div>
    );
}
