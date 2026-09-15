import { useEffect } from "react";
import { TodoCreateForm } from "@/components/todos/TodoCreateForm";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTodosUiStore } from "@/stores/todos-ui-store";

/**
 * Global "Add task" modal. Open state lives in the todos UI store so any
 * surface (top bar, keyboard shortcut, empty state) can open it without
 * prop drilling. The form itself stays dialog-agnostic and closes the
 * modal on successful create via `useCreateTodo`.
 */
export function AddTodoDialog() {
    const isAddOpen = useTodosUiStore((s) => s.isAddOpen);
    const setAddOpen = useTodosUiStore((s) => s.setAddOpen);
    const openAddModal = useTodosUiStore((s) => s.openAddModal);

    // `C` opens the dialog from anywhere except text inputs.
    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            const target = e.target as HTMLElement | null;
            const tag = target?.tagName;
            const typing = tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable;
            if (typing) return;
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            if (e.key === "c" || e.key === "C") {
                e.preventDefault();
                openAddModal();
            }
        }
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [openAddModal]);

    return (
        <Dialog open={isAddOpen} onOpenChange={setAddOpen}>
            <DialogContent aria-label="Add a task">
                <DialogHeader>
                    <DialogTitle>Add a task</DialogTitle>
                </DialogHeader>
                <TodoCreateForm />
            </DialogContent>
        </Dialog>
    );
}
