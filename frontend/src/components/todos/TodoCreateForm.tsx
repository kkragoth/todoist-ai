import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useCreateTodo } from "@/hooks/useTodos";
import { naturalDateISO, naturalDatePreview } from "@/lib/todo-buckets";
import { useTodosUiStore } from "@/stores/todos-ui-store";

export function TodoCreateForm() {
    const newTask = useTodosUiStore((s) => s.newTask);
    const newDate = useTodosUiStore((s) => s.newDate);
    const formError = useTodosUiStore((s) => s.formError);
    const setNewTask = useTodosUiStore((s) => s.setNewTask);
    const setNewDate = useTodosUiStore((s) => s.setNewDate);
    const createMutation = useCreateTodo();
    const lastAutoFilled = useRef<string | null>(null);

    const preview = naturalDatePreview(newTask);
    const detectedISO = naturalDateISO(newTask);

    // Mirror the mockup: dates typed in the text auto-fill the date field,
    // but a manual override sticks until the detected date changes again.
    useEffect(() => {
        if (detectedISO && detectedISO !== newDate && lastAutoFilled.current !== detectedISO) {
            lastAutoFilled.current = detectedISO;
            setNewDate(detectedISO);
        }
        if (!detectedISO) lastAutoFilled.current = null;
    }, [detectedISO, newDate, setNewDate]);

    function onAdd(e: React.FormEvent) {
        e.preventDefault();
        const task = newTask.trim();
        if (!task) return;
        createMutation.mutate({ task, todo_date: newDate || null });
    }

    return (
        <div>
            <form onSubmit={onAdd} className="rounded-xl border border-border bg-card p-3 shadow-sm">
                <div className="flex items-center gap-2">
                    <input
                        className="h-10 flex-1 bg-transparent px-1 text-[15px] outline-none placeholder:text-muted-foreground/60"
                        placeholder="Add a task — try “clean up my room tomorrow”"
                        value={newTask}
                        onChange={(e) => setNewTask(e.target.value)}
                    />
                    <input
                        type="date"
                        aria-label="Due date"
                        className="h-8 rounded-md border border-input bg-card px-2 text-xs whitespace-nowrap text-muted-foreground outline-none"
                        value={newDate}
                        onChange={(e) => setNewDate(e.target.value)}
                    />
                    <Button type="submit" disabled={createMutation.isPending || !newTask.trim()}>
                        {createMutation.isPending ? "Adding…" : "Add"}
                    </Button>
                </div>
                {preview && (
                    <p className="mt-1 border-t border-dashed border-border/70 pt-1.5 text-xs text-amber-600 dark:text-amber-400">
                        {preview}
                    </p>
                )}
                <p className="mt-1.5 text-xs text-muted-foreground/70">
                    Dates typed in the text — “tomorrow”, “fri”, “next week” — fill the date field automatically.
                    Override it any time.
                </p>
            </form>
            {formError && <p className="mt-2 text-sm text-destructive">{formError}</p>}
        </div>
    );
}
