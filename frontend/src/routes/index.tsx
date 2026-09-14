import { Link, Navigate, createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { DEFAULT_SEARCH, stripDatesUnlessCustom } from "@/lib/todos-filters";

export const Route = createFileRoute("/")({
    component: LandingPage,
});

function LandingPage() {
    const { isAuthenticated, isLoading } = useAuth();

    if (isLoading) return <p className="text-sm text-muted-foreground">Checking session…</p>;
    if (isAuthenticated) return <Navigate to="/todos" search={stripDatesUnlessCustom(DEFAULT_SEARCH)} />;

    return (
        <div className="mx-auto w-full max-w-xl py-8 text-center">
            <h1 className="text-3xl font-semibold tracking-tight">Todoist AI</h1>
            <p className="mt-2 text-sm text-muted-foreground">
                Plan with todos, chat with AI, stay in sync across CLI and web.
            </p>
            <div className="mt-6 flex items-center justify-center gap-2">
                <Link to="/login">
                    <Button variant="outline">Log in</Button>
                </Link>
                <Link to="/register">
                    <Button>Sign up</Button>
                </Link>
            </div>
            <div className="mt-8 grid gap-2 text-left text-sm">
                <div className="rounded-lg border border-border bg-card p-3">
                    <p className="font-medium">Current todos</p>
                    <p className="text-muted-foreground">
                        Filter by status, archived, and date — all shareable via URL.
                    </p>
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
                    <p className="font-medium">Live sync</p>
                    <p className="text-muted-foreground">Edits from the CLI or another tab appear instantly.</p>
                </div>
            </div>
        </div>
    );
}
