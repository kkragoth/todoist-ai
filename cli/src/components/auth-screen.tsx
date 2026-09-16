import { useEffect, useRef } from "react";
import { useTerminalDimensions } from "@opentui/react";
import { ConnectionStatusBadge } from "@/components/connection-status.js";
import { PasswordInput } from "@/components/ui/password-input.js";
import { isDisconnected } from "@/lib/connection.js";
import { useAuthStore } from "@/stores/auth-store.js";
import { useSessionStore } from "@/stores/session-store.js";
import { AuthFocus, AuthMode } from "@/types.js";

/** Sign-in screen. Self-contained: reads the auth + session stores directly.
 * Browser OAuth is the primary login (auto-starts on mount); username /
 * password tabs appear only with --allow-password-login. */
export function AuthScreen() {
    const apiUrl = useSessionStore((s) => s.apiUrl);
    const connection = useSessionStore((s) => s.connection);
    const allowPasswordLogin = useSessionStore((s) => s.allowPasswordLogin);
    const mode = useAuthStore((s) => s.mode);
    const focus = useAuthStore((s) => s.focus);
    const error = useAuthStore((s) => s.error);
    const busy = useAuthStore((s) => s.busy);
    const pass = useAuthStore((s) => s.pass);
    const oauthUrl = useAuthStore((s) => s.oauthUrl);
    const setMode = useAuthStore((s) => s.setMode);
    const setFocus = useAuthStore((s) => s.setFocus);
    const setUser = useAuthStore((s) => s.setUser);
    const setPass = useAuthStore((s) => s.setPass);
    const setError = useAuthStore((s) => s.setError);
    const doAuth = useAuthStore((s) => s.doAuth);
    const doOAuth = useAuthStore((s) => s.doOAuth);
    const { width } = useTerminalDimensions();
    const formWidth = Math.max(40, Math.min(64, width - 4));
    const autoStarted = useRef(false);

    useEffect(() => {
        setFocus(AuthFocus.Tabs);
    }, [setFocus]);

    useEffect(() => {
        if (mode === AuthMode.OAuth && !autoStarted.current) {
            autoStarted.current = true;
            void doOAuth();
        }
    }, [mode, doOAuth]);

    return (
        <box flexDirection="column" alignItems="center" style={{ padding: 1, gap: 1 }}>
            <box flexDirection="column" style={{ width: formWidth, gap: 1 }}>
                <box border title="Todoist AI" borderStyle="rounded" style={{ padding: 1 }}>
                    <text>
                        <strong>Sign in</strong>
                        <span fg="gray"> — backend {apiUrl} · ←/→ switch tab · tab next field · enter submits</span>
                    </text>
                </box>
                <ConnectionStatusBadge />
                {isDisconnected(connection) && (
                    <text fg="red">
                        Backend unreachable at {apiUrl} — start the server; retrying automatically, or submit to retry.
                    </text>
                )}
                {error && <text fg="red">{error}</text>}
                {allowPasswordLogin ? (
                    <tab-select
                        focused={focus === AuthFocus.Tabs}
                        showDescription={false}
                        options={[
                            { name: "Browser", description: "Sign in via browser (OAuth)" },
                            { name: "Login", description: "Sign in with username + password" },
                            { name: "Register", description: "Create a new account" },
                        ]}
                        onChange={(index: number) => {
                            setMode(index === 1 ? AuthMode.Login : index === 2 ? AuthMode.Register : AuthMode.OAuth);
                            setError("");
                        }}
                        onSelect={(index: number) => {
                            if (index === 0) void doOAuth();
                            else setFocus(AuthFocus.User);
                        }}
                    />
                ) : (
                    <text fg="gray">Mode: browser — finish the login in your browser</text>
                )}
                {mode === AuthMode.OAuth ? (
                    <box flexDirection="column" style={{ gap: 1 }}>
                        <text>
                            {busy
                                ? "Waiting for the browser login… approve the Todoist AI account there."
                                : "Browser login — no password typing."}
                        </text>
                        {oauthUrl && (
                            <text fg="gray">
                                If no browser opened, visit: <span fg="cyan">{oauthUrl}</span>
                            </text>
                        )}
                        {!busy && !allowPasswordLogin && (
                            <tab-select
                                focused={focus === AuthFocus.Tabs}
                                showDescription={false}
                                options={[{ name: "↻ Open browser again", description: "Restart the OAuth login" }]}
                                onSelect={() => void doOAuth()}
                            />
                        )}
                    </box>
                ) : (
                    <>
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
                    </>
                )}
            </box>
        </box>
    );
}
