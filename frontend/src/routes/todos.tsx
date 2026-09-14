import { Navigate, createFileRoute } from "@tanstack/react-router";
import { TodoCreateForm } from "@/components/todos/TodoCreateForm";
import { TodoList } from "@/components/todos/TodoList";
import { TodosFilters } from "@/components/todos/TodosFilters";
import { useAuth } from "@/lib/auth";
import { DEFAULT_SEARCH, parseSearch } from "@/lib/todos-filters";
import { useTodosEvents } from "@/lib/useTodosEvents";

export const Route = createFileRoute("/todos")({
    validateSearch: (search: Record<string, unknown>) => ({
        ...DEFAULT_SEARCH,
        ...parseSearch(search),
    }),
    component: TodosPage,
});

function TodosPage() {
    const { isAuthenticated, isLoading } = useAuth();
    useTodosEvents(isAuthenticated);

    if (isLoading) return <p className="text-sm text-muted-foreground">Checking session…</p>;
    if (!isAuthenticated) return <Navigate to="/login" search={{ redirect: "/todos" }} />;

    return (
        <div>
            <TodoCreateForm />
            <TodosFilters />
            <TodoList isAuthenticated={isAuthenticated} authChecked={!isLoading} />
        </div>
    );
}
