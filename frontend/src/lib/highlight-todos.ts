// Flash-highlight todo rows in the main list and scroll the first one
// into view. Shared by assistant text pills, widgets, and ui_action
// handling — one place for the timing + scroll behavior.

import { useTodosUiStore } from "@/stores/todos-ui-store";

export const HIGHLIGHT_CLEAR_MS = 1700;

export function highlightTodoIds(ids: number[]) {
    if (ids.length === 0) return;
    const store = useTodosUiStore.getState();
    store.flashTodos(ids);
    window.setTimeout(() => {
        const current = useTodosUiStore.getState().flashIds;
        if (ids.every((id) => current.includes(id))) store.clearFlash();
    }, HIGHLIGHT_CLEAR_MS);
    const first = document.querySelector(`[data-todo-id="${ids[0]}"]`);
    first?.scrollIntoView({ behavior: "smooth", block: "center" });
}
