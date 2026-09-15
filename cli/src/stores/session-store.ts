import { create } from "zustand";
import { apiHealth } from "@/api.js";
import { ConnectionStatus } from "@/lib/connection.js";
import { clearToken, loadToken, saveTokenData } from "@/lib/token-file.js";
import type { CliOptions } from "@/types.js";

/** Global session + connection settings. Token is restored once at boot;
 * CLI flags are applied via init() in main.tsx before first render. */
interface SessionState {
    apiUrl: string;
    token: string | null;
    username: string;
    threadId: string;
    provider: string | undefined;
    model: string | undefined;
    /** MCP direct mode: plain text lists via MCP (bypasses the LLM). */
    mcpDirect: boolean;
    connection: ConnectionStatus;
    init: (options: CliOptions) => void;
    signIn: (token: string, username: string) => void;
    signOut: () => void;
    invalidateToken: () => void;
    setUsername: (username: string) => void;
    setThreadId: (threadId: string) => void;
    setProvider: (provider: string | undefined) => void;
    setModel: (model: string | undefined) => void;
    setMcpDirect: (mcpDirect: boolean) => void;
    setConnection: (connection: ConnectionStatus) => void;
    /** Probe GET /health with a short timeout and flip connection state. */
    checkConnection: () => Promise<boolean>;
}

export const useSessionStore = create<SessionState>()((set, get) => ({
    apiUrl: "http://localhost:8000",
    token: loadToken(),
    username: "",
    threadId: "",
    provider: undefined,
    model: undefined,
    mcpDirect: false,
    connection: ConnectionStatus.Connecting,
    init: (options) =>
        set({
            apiUrl: options.apiUrl,
            threadId: options.threadId,
            provider: options.provider,
            model: options.model,
            mcpDirect: options.mcpDirect,
        }),
    signIn: (token, username) => {
        saveTokenData({ access_token: token, token_type: "bearer" });
        set({ token, username });
    },
    signOut: () => {
        clearToken();
        set({ token: null, username: "", threadId: "" });
    },
    invalidateToken: () => {
        clearToken();
        set({ token: null });
    },
    setUsername: (username) => set({ username }),
    setThreadId: (threadId) => set({ threadId }),
    setProvider: (provider) => set({ provider }),
    setModel: (model) => set({ model }),
    setMcpDirect: (mcpDirect) => set({ mcpDirect }),
    setConnection: (connection) => set({ connection }),
    checkConnection: async () => {
        const { apiUrl } = get();
        set({ connection: ConnectionStatus.Connecting });
        const ok = await apiHealth(apiUrl);
        set({ connection: ok ? ConnectionStatus.Connected : ConnectionStatus.Disconnected });
        return ok;
    },
}));
