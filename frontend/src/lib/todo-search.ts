import Fuse from "fuse.js";
import type { Todo } from "@/lib/api";

export function filterTodosFuzzy(todos: Todo[], query: string): Todo[] {
    const q = query.trim();
    if (!q) return todos;
    const fuse = new Fuse(todos, {
        keys: ["task"],
        threshold: 0.4,
        ignoreLocation: true,
        minMatchCharLength: 1,
    });
    return fuse.search(q).map((result) => result.item);
}
