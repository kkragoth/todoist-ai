import { create } from "zustand";
import { apiHealth, apiLogin, apiMe, apiRegister, BOOT_TIMEOUT_MS } from "@/api.js";
import { ConnectionStatus } from "@/lib/connection.js";
import { useChatStore } from "@/stores/chat-store.js";
import { useSessionStore } from "@/stores/session-store.js";
import { AuthFocus, AuthMode } from "@/types.js";

/** Sign-in form state + boot token validation. Called once from main.tsx;
 * any component (AuthScreen, slash logout) reads/writes it directly. */
interface AuthState {
    mode: AuthMode;
    focus: AuthFocus;
    user: string;
    pass: string;
    error: string;
    busy: boolean;
    setMode: (mode: AuthMode) => void;
    setFocus: (focus: AuthFocus) => void;
    setUser: (user: string) => void;
    setPass: (pass: string) => void;
    setError: (error: string) => void;
    doAuth: () => Promise<void>;
    reset: () => void;
    boot: () => void;
    retryBoot: () => void;
}

let bootStarted = false;

export const useAuthStore = create<AuthState>()((set, get) => ({
    mode: AuthMode.Login,
    focus: AuthFocus.User,
    user: "",
    pass: "",
    error: "",
    busy: false,
    setMode: (mode) => set({ mode }),
    setFocus: (focus) => set({ focus }),
    setUser: (user) => set({ user }),
    setPass: (pass) => set({ pass }),
    setError: (error) => set({ error }),
    doAuth: async () => {
        const u = get().user.trim();
        const { pass, mode } = get();
        if (!u || !pass) {
            set({ error: "Username and password are required." });
            return;
        }
        const session = useSessionStore.getState();
        session.setConnection(ConnectionStatus.Connecting);
        set({ busy: true, error: "" });
        try {
            if (mode === AuthMode.Register) {
                await apiRegister(session.apiUrl, u, pass);
            }
            const accessToken = await apiLogin(session.apiUrl, u, pass);
            session.setConnection(ConnectionStatus.Connected);
            session.signIn(accessToken, u);
            useChatStore.getState().pushSystem(`Signed in as ${u}. Type /help for commands.`);
            set({ pass: "" });
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            if (message.includes("unreachable") || message.includes("timed out") || message.includes("fetch")) {
                session.setConnection(ConnectionStatus.Disconnected);
            } else {
                // Backend answered (e.g. bad credentials) — it is reachable.
                session.setConnection(ConnectionStatus.Connected);
            }
            set({ error: message });
        } finally {
            set({ busy: false });
        }
    },
    reset: () => set({ mode: AuthMode.Login, focus: AuthFocus.User, pass: "", error: "" }),
    retryBoot: () => {
        bootStarted = false;
        get().boot();
    },
    boot: () => {
        if (bootStarted) return;
        bootStarted = true;
        void (async () => {
            const session = useSessionStore.getState();
            const chat = useChatStore.getState();
            session.setConnection(ConnectionStatus.Connecting);
            if (!session.token) {
                const reachable = await apiHealth(session.apiUrl, BOOT_TIMEOUT_MS);
                session.setConnection(reachable ? ConnectionStatus.Connected : ConnectionStatus.Disconnected);
                return;
            }
            const me = await apiMe(session.apiUrl, session.token, BOOT_TIMEOUT_MS);
            if (me.status === "ok") {
                session.setConnection(ConnectionStatus.Connected);
                session.setUsername(me.username);
                chat.pushSystem(
                    `Signed in as ${me.username} · ${session.provider ?? "server default"}${session.model ? `:${session.model}` : ""}. Type /help for commands.`,
                );
            } else if (me.status === "invalid") {
                // Backend answered — reachable, just a stale token.
                session.setConnection(ConnectionStatus.Connected);
                session.invalidateToken();
                set({ error: "Saved session expired — please log in again." });
            } else {
                session.setConnection(ConnectionStatus.Disconnected);
                chat.setStatus(`Backend unreachable at ${session.apiUrl} — token kept, check the server.`);
                chat.pushSystem(
                    `Backend unreachable at ${session.apiUrl}. Start it, then send a message to retry (token kept).`,
                );
            }
        })();
    },
}));
