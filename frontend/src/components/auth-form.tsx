import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";

export function AuthForm({
    passwordAutoComplete,
    submitLabel,
    pendingLabel,
    errorLabel,
    onAuth,
}: {
    passwordAutoComplete: "current-password" | "new-password";
    submitLabel: string;
    pendingLabel: string;
    errorLabel: string;
    onAuth: (username: string, password: string) => Promise<void>;
}) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setPending(true);
        try {
            await onAuth(username.trim(), password);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : errorLabel);
        } finally {
            setPending(false);
        }
    }

    return (
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
                    autoComplete={passwordAutoComplete}
                    required
                />
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={pending}>
                {pending ? pendingLabel : submitLabel}
            </Button>
        </form>
    );
}
