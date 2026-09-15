// "Clean up my room" domain action: archive all completed todos.
// UI state (view flip) stays in the caller — this module only touches data.

import { fetchTodos, patchTodo } from "@/lib/api";

export async function archiveCompletedTodos(): Promise<number> {
    const done = await fetchTodos({ completed: true });
    const open = done.filter((todo) => !todo.archived);
    await Promise.all(open.map((todo) => patchTodo(todo.id, { archived: true })));
    return open.length;
}
