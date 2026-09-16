import { Link, Navigate, createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { AuthForm } from "@/components/auth-form";
import { useAuth } from "@/lib/auth";
import { todosHomeSearch } from "@/lib/todos-filters";

export const Route = createFileRoute("/login")({
    validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
        redirect: typeof search["redirect"] === "string" ? search["redirect"] : undefined,
    }),
    component: LoginPage,
});

function LoginPage() {
    const { isAuthenticated, isLoading, login } = useAuth();
    const navigate = useNavigate();
    const search = useSearch({ from: "/login" });

    if (isLoading) {
        return <p className="text-sm text-muted-foreground">Checking session…</p>;
    }
    if (isAuthenticated) {
        return <Navigate to="/todos" search={todosHomeSearch()} />;
    }

    return (
        <div className="mx-auto w-full max-w-sm">
            <h1 className="text-2xl font-semibold tracking-tight">Log in</h1>
            <p className="mt-1 text-sm text-muted-foreground">
                No account yet?{" "}
                <Link to="/register" className="underline underline-offset-4">
                    Register
                </Link>
            </p>
            <AuthForm
                passwordAutoComplete="current-password"
                submitLabel="Log in"
                pendingLabel="Logging in…"
                errorLabel="Login failed"
                onAuth={async (username, password) => {
                    await login(username, password);
                    navigate({ to: search.redirect ?? "/todos" });
                }}
            />
        </div>
    );
}
