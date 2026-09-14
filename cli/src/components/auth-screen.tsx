import { useEffect } from "react";
import { useTerminalDimensions } from "@opentui/react";
import { PasswordInput } from "@/components/ui/password-input.js";
import { useAuthStore } from "@/stores/auth-store.js";
import { useSessionStore } from "@/stores/session-store.js";
import { AuthFocus, AuthMode } from "@/types.js";

/** Sign-in screen. Self-contained: reads the auth + session stores directly. */
export function AuthScreen() {
    const apiUrl = useSessionStore((s) => s.apiUrl);
    const mode = useAuthStore((s) => s.mode);
    const focus = useAuthStore((s) => s.focus);
    const error = useAuthStore((s) => s.error);
    const busy = useAuthStore((s) => s.busy);
    const pass = useAuthStore((s) => s.pass);
    const setMode = useAuthStore((s) => s.setMode);
    const setFocus = useAuthStore((s) => s.setFocus);
    const setUser = useAuthStore((s) => s.setUser);
    const setPass = useAuthStore((s) => s.setPass);
    const setError = useAuthStore((s) => s.setError);
    const doAuth = useAuthStore((s) => s.doAuth);
    const { width } = useTerminalDimensions();
    const formWidth = Math.max(40, Math.min(64, width - 4));

    useEffect(() => {
        setFocus(AuthFocus.User);
    }, [setFocus]);

    return (
        <box flexDirection="column" alignItems="center" style={{ padding: 1, gap: 1 }}>
            <box flexDirection="column" style={{ width: formWidth, gap: 1 }}>
                <box border title="Todoist AI" borderStyle="rounded" style={{ padding: 1 }}>
                    <text>
                        <strong>Sign in</strong>
                        <span fg="gray"> — backend {apiUrl} · ←/→ switch tab · tab next field · enter submits</span>
                    </text>
                </box>
                {error && <text fg="red">{error}</text>}
                <tab-select
                    focused={focus === AuthFocus.Tabs}
                    showDescription={false}
                    options={[
                        { name: "Login", description: "Sign in to an existing account" },
                        { name: "Register", description: "Create a new account" },
                    ]}
                    onChange={(index: number) => {
                        setMode(index === 1 ? AuthMode.Register : AuthMode.Login);
                        setError("");
                    }}
                    onSelect={() => setFocus(AuthFocus.User)}
                />
                <box title="Username" border style={{ height: 3 }}>
                    <input
                        placeholder="username"
                        focused={focus === AuthFocus.User}
                        onInput={setUser}
                        onSubmit={() => setFocus(AuthFocus.Pass)}
                    />
                </box>
                <PasswordInput
                    title="Password"
                    placeholder="password — ctrl+h reveals"
                    focused={focus === AuthFocus.Pass}
                    value={pass}
                    onChange={setPass}
                    onSubmit={() => void doAuth()}
                    width={formWidth}
                    showToggle
                />
                <text fg="gray">
                    {busy
                        ? "Authenticating…"
                        : mode === AuthMode.Login
                          ? "Mode: login — switch tabs above for a new account"
                          : "Mode: register — creates the account, then signs in"}
                </text>
            </box>
        </box>
    );
}
