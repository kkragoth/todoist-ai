import { useEffect, useState } from "react";
import { apiLogin, apiMe, apiRegister } from "@/api.js";
import { useChatStore } from "@/stores/chat-store.js";
import { useSessionStore } from "@/stores/session-store.js";
import { AuthFocus, AuthMode } from "@/types.js";

/** Auth screen state + boot token validation. Signed-in state itself
 * lives in the session store; the form fields stay local to this hook. */
export function useAuth() {
    const token = useSessionStore((s) => s.token);
    const [mode, setMode] = useState<AuthMode>(AuthMode.Login);
    const [focus, setFocus] = useState<AuthFocus>(AuthFocus.Tabs);
    const [user, setUser] = useState("");
    const [pass, setPass] = useState("");
    const [error, setError] = useState("");
    const [authBusy, setAuthBusy] = useState(false);

    // Validate a restored token on boot.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const session = useSessionStore.getState();
            const chat = useChatStore.getState();
            if (!session.token) return;
            const me = await apiMe(session.apiUrl, session.token);
            if (cancelled) return;
            if (me.status === "ok") {
                session.setUsername(me.username);
                chat.pushSystem(
                    `Signed in as ${me.username} · ${session.provider ?? "server default"}${session.model ? `:${session.model}` : ""}. Type /help for commands.`,
                );
            } else if (me.status === "invalid") {
                session.invalidateToken();
                setError("Saved session expired — please log in again.");
            } else {
                chat.setStatus(`Backend unreachable at ${session.apiUrl} — token kept, check the server.`);
                chat.pushSystem(
                    `Backend unreachable at ${session.apiUrl}. Start it, then send a message to retry (token kept).`,
                );
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    async function doAuth(): Promise<void> {
        const u = user.trim();
        if (!u || !pass) {
            setError("Username and password are required.");
            return;
        }
        setAuthBusy(true);
        setError("");
        try {
            const session = useSessionStore.getState();
            if (mode === AuthMode.Register) {
                await apiRegister(session.apiUrl, u, pass);
            }
            const accessToken = await apiLogin(session.apiUrl, u, pass);
            session.signIn(accessToken, u);
            useChatStore.getState().pushSystem(`Signed in as ${u}. Type /help for commands.`);
            setPass("");
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setAuthBusy(false);
        }
    }

    function reset(): void {
        setMode(AuthMode.Login);
        setFocus(AuthFocus.Tabs);
        setPass("");
        setError("");
    }

    return {
        mode,
        setMode,
        focus,
        setFocus,
        user,
        setUser,
        pass,
        setPass,
        error,
        setError,
        busy: authBusy,
        signedIn: token !== null,
        doAuth,
        reset,
    };
}
