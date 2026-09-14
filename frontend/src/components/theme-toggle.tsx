import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isDarkTheme, useTheme } from "@/lib/theme";

export function ThemeToggle() {
    const { theme, toggleTheme } = useTheme();
    const isDark = isDarkTheme(theme);

    return (
        <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleTheme}
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
            {isDark ? <Sun /> : <Moon />}
        </Button>
    );
}
