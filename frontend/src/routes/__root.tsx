import { Link, Outlet, createRootRoute } from "@tanstack/react-router";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { ThemeToggle } from "../components/theme-toggle";
import { UserMenu } from "../components/user-menu";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background">
        <div className="flex h-10 w-full items-center justify-between px-3">
          <Link to="/" className="text-[13px] font-semibold tracking-tight">
            Todoist AI
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            {isLoading ? null : isAuthenticated ? (
              <UserMenu />
            ) : (
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
      {/* Reserved space for the future MCP chat panel: it can read the
          JWT via useAuth().authHeader() and talk to /mcp. */}
    </div>
  );
}
