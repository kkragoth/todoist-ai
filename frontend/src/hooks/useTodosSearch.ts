import { useNavigate, useSearch } from "@tanstack/react-router";
import { stripDatesUnlessCustom, type TodosSearchParams } from "@/lib/todos-filters";

/** Shared URL-patch helper for the `/todos` filter bars. */
export function useUpdateTodosSearch(): (patch: Partial<TodosSearchParams>) => void {
    const search = useSearch({ from: "/todos" });
    const navigate = useNavigate({ from: "/todos" });
    return (patch) => {
        navigate({ to: "/todos", search: stripDatesUnlessCustom({ ...search, ...patch }) });
    };
}
