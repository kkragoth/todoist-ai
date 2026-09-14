import { LogOut } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";

function initials(name: string | null): string {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function UserMenu() {
    const { username, logout } = useAuth();

    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                aria-label="User menu"
            >
                <Avatar size="sm" className="cursor-pointer">
                    <AvatarFallback>{initials(username)}</AvatarFallback>
                </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={8} className="w-48">
                <DropdownMenuGroup>
                    <DropdownMenuLabel className="truncate">{username}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={logout}>
                        <LogOut />
                        Log out
                    </DropdownMenuItem>
                </DropdownMenuGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
