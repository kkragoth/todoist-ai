import { Link, Outlet, createRootRoute } from "@tanstack/react-router";
import { AnimatePresence } from "motion/react";
import { AskAssistantButton, AssistantSidebar } from "@/components/assistant-sidebar";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { useAuth } from "@/lib/auth";
import { useTodosUiStore } from "@/stores/todos-ui-store";

export const Route = createRootRoute({
    component: RootLayout,
});

function RootLayout() {
    const { isAuthenticated, isLoading } = useAuth();
    const assistantOpen = useTodosUiStore((s) => s.assistantOpen);
    const showSidebar = !isLoading && isAuthenticated && assistantOpen;

    return (
        <div className="flex h-svh flex-col overflow-hidden bg-background text-foreground">
            <header className="z-20 h-12 shrink-0 border-b border-border/60 bg-card/80 backdrop-blur">
                <div className="flex h-12 w-full items-center justify-between px-3">
                    <div className="flex items-center gap-3">
                        <Link to="/" className="text-[13px] font-semibold tracking-tight">
                            Todoist AI
                        </Link>
                    </div>
                    <div className="flex items-center gap-3">
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
            <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:pr-3">
                <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
                    <div className="mx-auto w-full max-w-3xl px-4 py-8">
                        <Outlet />
                    </div>
                </main>
                <AnimatePresence>{showSidebar && <AssistantSidebar />}</AnimatePresence>
            </div>
        </div>
    );
}
