import { useState } from "react";
import { Link, Navigate, createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { DEFAULT_SEARCH, stripDatesUnlessCustom } from "@/lib/todos-filters";

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
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);

    if (isLoading) {
        return <p className="text-sm text-muted-foreground">Checking session…</p>;
    }
    if (isAuthenticated) {
        return <Navigate to="/todos" search={stripDatesUnlessCustom(DEFAULT_SEARCH)} />;
    }

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setPending(true);
        try {
            await login(username.trim(), password);
            navigate({ to: search.redirect ?? "/todos" });
        } catch (err) {
            setError(err instanceof ApiError ? err.message : "Login failed");
        } finally {
            setPending(false);
        }
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
            <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
                <label className="flex flex-col gap-1 text-sm">
                    Username
                    <input
                        className="h-9 rounded-lg border border-input bg-card px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        autoComplete="username"
                        required
                    />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                    Password
                    <input
                        type="password"
                        className="h-9 rounded-lg border border-input bg-card px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        required
                    />
                </label>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" disabled={pending}>
                    {pending ? "Logging in…" : "Log in"}
                </Button>
            </form>
        </div>
    );
}
