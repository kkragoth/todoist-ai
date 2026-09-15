import { Link, Navigate, createFileRoute, useNavigate } from "@tanstack/react-router";
import { AuthForm } from "@/components/auth-form";
import { useAuth } from "@/lib/auth";
import { todosHomeSearch } from "@/lib/todos-filters";

export const Route = createFileRoute("/register")({
    component: RegisterPage,
});

function RegisterPage() {
    const { isAuthenticated, isLoading, register } = useAuth();
    const navigate = useNavigate();

    if (isLoading) {
        return <p className="text-sm text-muted-foreground">Checking session…</p>;
    }
    if (isAuthenticated) {
        return <Navigate to="/todos" search={todosHomeSearch()} />;
    }

    return (
        <div className="mx-auto w-full max-w-sm">
            <h1 className="text-2xl font-semibold tracking-tight">Create account</h1>
            <p className="mt-1 text-sm text-muted-foreground">
                Already have one?{" "}
                <Link to="/login" className="underline underline-offset-4">
                    Log in
                </Link>
            </p>
            <AuthForm
                passwordAutoComplete="new-password"
                submitLabel="Register"
                pendingLabel="Creating account…"
                errorLabel="Registration failed"
                onAuth={async (username, password) => {
                    await register(username, password);
                    navigate({ to: "/todos", search: todosHomeSearch() });
                }}
            />
        </div>
    );
}
