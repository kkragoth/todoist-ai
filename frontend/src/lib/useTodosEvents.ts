import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { API_BASE, getToken, type Todo } from "@/lib/api";
import { useTodosUiStore } from "@/stores/todos-ui-store";

function snapshotTodos(queryClient: ReturnType<typeof useQueryClient>): Map<number, string> {
    const snap = new Map<number, string>();
    const queries = queryClient.getQueriesData<Todo[]>({ queryKey: ["todos"] });
    for (const [, data] of queries) {
        if (!Array.isArray(data)) continue;
        for (const todo of data) {
            snap.set(todo.id, `${todo.task}|${todo.todo_date}|${todo.completed}|${todo.archived}`);
        }
    }
    return snap;
}

/**
 * Live-updates the todo list: opens the backend SSE stream and invalidates
 * the ["todos"] queries whenever anything (CLI, another tab, this tab)
 * changes a todo. React Query then refetches with the active filters.
 * New or changed rows get a border-pulse entry flash via the todos UI store.
 * EventSource reconnects by itself if the connection drops.
 */
export function useTodosEvents(enabled: boolean) {
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!enabled) return;
        const token = getToken();
        if (!token) return;
        const es = new EventSource(`${API_BASE}/api/todos/events?token=${encodeURIComponent(token)}`);
        let flashTimer: number | undefined;
        let clearTimer: number | undefined;
        es.onmessage = () => {
            const before = snapshotTodos(queryClient);
            queryClient.invalidateQueries({ queryKey: ["todos"] });
            window.clearTimeout(flashTimer);
            window.clearTimeout(clearTimer);
            flashTimer = window.setTimeout(() => {
                const after = snapshotTodos(queryClient);
                const changed: number[] = [];
                for (const [id, sig] of after) {
                    if (before.get(id) !== sig) changed.push(id);
                }
                if (changed.length > 0) {
                    useTodosUiStore.getState().flashTodos(changed);
                    clearTimer = window.setTimeout(() => {
                        useTodosUiStore.getState().clearFlash();
                    }, 1700);
                }
            }, 700);
        };
        return () => {
            window.clearTimeout(flashTimer);
            window.clearTimeout(clearTimer);
            es.close();
        };
    }, [enabled, queryClient]);
}
