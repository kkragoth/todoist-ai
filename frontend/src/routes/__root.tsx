import { Link, Outlet, createRootRoute } from "@tanstack/react-router";
import { AskAssistantButton, AssistantDrawer } from "@/components/assistant-drawer";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/user-menu";
import { useAuth } from "@/lib/auth";
import { DEFAULT_SEARCH } from "@/lib/todos-filters";

export const Route = createRootRoute({
    component: RootLayout,
});

function RootLayout() {
    const { isAuthenticated, isLoading } = useAuth();

    return (
        <div className="min-h-svh bg-background text-foreground">
            <header className="sticky top-0 z-20 bg-card/80 backdrop-blur">
                <div className="flex h-12 w-full items-center justify-between px-3">
                    <div className="flex items-center gap-3">
                        <Link to="/" className="text-[13px] font-semibold tracking-tight">
                            Todoist AI
                        </Link>
                        {!isLoading && isAuthenticated && (
                            <Link
                                to="/todos"
                                search={DEFAULT_SEARCH}
                                className="text-[13px] text-muted-foreground hover:text-foreground"
                            >
                                Todos
                            </Link>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5">
                        {!isLoading && isAuthenticated && <AskAssistantButton />}
                        <ThemeToggle />
                        {!isLoading && isAuthenticated && <UserMenu />}
                        {!isLoading && !isAuthenticated && (
                            <>
                                <Link to="/login">
                                    <Button variant="ghost" size="xs">
                                        Log in
                                    </Button>
                                </Link>
                                <Link to="/register">
                                    <Button size="xs">Sign up</Button>
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            </header>
            <main className="mx-auto w-full max-w-3xl px-4 py-8">
                <Outlet />
            </main>
            <AssistantDrawer />
        </div>
    );
}
