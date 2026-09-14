import { useState } from "react";
import { Link, Navigate, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { DEFAULT_SEARCH } from "@/lib/todos-filters";

export const Route = createFileRoute("/register")({
    component: RegisterPage,
});

function RegisterPage() {
    const { isAuthenticated, isLoading, register } = useAuth();
    const navigate = useNavigate();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);

    if (isLoading) {
        return <p className="text-sm text-muted-foreground">Checking session…</p>;
    }
    if (isAuthenticated) {
        return <Navigate to="/todos" search={DEFAULT_SEARCH} />;
    }

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setPending(true);
        try {
            await register(username.trim(), password);
            navigate({ to: "/todos", search: DEFAULT_SEARCH });
        } catch (err) {
            setError(err instanceof ApiError ? err.message : "Registration failed");
        } finally {
            setPending(false);
        }
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
                        autoComplete="new-password"
                        required
                    />
                </label>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" disabled={pending}>
                    {pending ? "Creating account…" : "Register"}
                </Button>
            </form>
        </div>
    );
}
