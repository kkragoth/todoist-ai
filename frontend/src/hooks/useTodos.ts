import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, archiveTodo, createTodo, fetchTodos, patchTodo, unarchiveTodo } from "@/lib/api";
import { toTodosQuery, todosQueryKey, type TodosSearchParams } from "@/lib/todos-filters";
import { useAssistantStore } from "@/stores/assistant-store";
import { useTodosUiStore } from "@/stores/todos-ui-store";

export function useTodosQuery(search: TodosSearchParams, enabled: boolean) {
    return useQuery({
        queryKey: todosQueryKey(search),
        queryFn: () => fetchTodos(toTodosQuery(search)),
        enabled,
    });
}

function useInvalidateTodos() {
    const queryClient = useQueryClient();
    return () => queryClient.invalidateQueries({ queryKey: ["todos"] });
}

export function useCreateTodo() {
    const invalidate = useInvalidateTodos();
    return useMutation({
        mutationFn: (input: { task: string; todo_date: string | null }) => createTodo(input),
        onSuccess: () => {
            const ui = useTodosUiStore.getState();
            ui.resetForm();
            if (ui.isAddOpen) ui.closeAddModal();
            invalidate();
        },
        onError: (err) => {
            const message = err instanceof ApiError ? err.message : "Could not add todo";
            useTodosUiStore.getState().setFormError(message);
        },
    });
}

export function usePatchTodo() {
    const invalidate = useInvalidateTodos();
    return useMutation({
        mutationFn: ({ id, update }: { id: number; update: Parameters<typeof patchTodo>[1] }) => patchTodo(id, update),
        onSuccess: (data, variables) => {
            // Keep sidebar snapshots in sync when the same task is toggled
            // from the main list (or anywhere else using this hook).
            const completed = data?.completed ?? variables.update.completed;
            if (typeof completed === "boolean") {
                useAssistantStore.getState().setWidgetTodoCompleted(variables.id, completed);
            }
            invalidate();
        },
    });
}

export function useArchiveTodo() {
    const invalidate = useInvalidateTodos();
    return useMutation({
        mutationFn: (id: number) => archiveTodo(id),
        onSuccess: invalidate,
    });
}

export function useUnarchiveTodo() {
    const invalidate = useInvalidateTodos();
    return useMutation({
        mutationFn: (id: number) => unarchiveTodo(id),
        onSuccess: invalidate,
    });
}
