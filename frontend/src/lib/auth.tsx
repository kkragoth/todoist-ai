import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
    UNAUTHORIZED_EVENT,
    authHeader as apiAuthHeader,
    clearSession,
    fetchMe,
    getToken,
    loginUser,
    registerUser,
    setSession,
    type UserProfile,
} from "@/lib/api";

interface AuthContextValue {
    token: string | null;
    user: UserProfile | null;
    username: string | null;
    isAuthenticated: boolean;
    /** True while the stored token is being validated against GET /auth/me. */
    isLoading: boolean;
    login: (username: string, password: string) => Promise<void>;
    register: (username: string, password: string) => Promise<void>;
    logout: () => void;
    /** Raw token for future MCP chat requests (`Authorization: Bearer <token>`). */
    authHeader: () => Record<string, string>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function establishSession(
    token: string,
    name: string,
    setToken: (token: string) => void,
    setUser: (user: UserProfile | null) => void,
): Promise<void> {
    setSession(token, name);
    setToken(token);
    // Populate the profile right away so callers don't wait for the effect.
    // If it fails the validation effect will clean up.
    try {
        const profile = await fetchMe();
        setUser(profile);
    } catch {
        // Let the token effect handle session cleanup on real failures.
    }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [token, setToken] = useState<string | null>(() => getToken());
    const [user, setUser] = useState<UserProfile | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(() => getToken() != null);

    const logout = useCallback(() => {
        clearSession();
        setToken(null);
        setUser(null);
        setIsLoading(false);
    }, []);

    // Server is the source of truth for login state: whenever we hold a token,
    // validate it against GET /auth/me. No token -> logged out.
    useEffect(() => {
        if (!token) {
            setUser(null);
            setIsLoading(false);
            return;
        }
        let cancelled = false;
        setIsLoading(true);
        fetchMe()
            .then((profile) => {
                if (!cancelled) setUser(profile);
            })
            .catch(() => {
                // fetchMe already clears the session + fires UNAUTHORIZED_EVENT on 401.
                if (!cancelled) {
                    setToken(getToken());
                    setUser(null);
                }
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [token]);

    // Auto-logout when apiFetch sees a 401 (expired/invalid token).
    useEffect(() => {
        const onUnauthorized = () => {
            setToken(null);
            setUser(null);
            setIsLoading(false);
        };
        window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
        return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    }, []);

    const login = useCallback(async (name: string, password: string) => {
        const data = await loginUser(name, password);
        await establishSession(data.access_token, name, setToken, setUser);
    }, []);

    const register = useCallback(async (name: string, password: string) => {
        await registerUser(name, password);
        // Backend register returns only a message, so log in right after.
        const data = await loginUser(name, password);
        await establishSession(data.access_token, name, setToken, setUser);
    }, []);

    const authHeader = useCallback((): Record<string, string> => apiAuthHeader(), []);

    const value = useMemo<AuthContextValue>(
        () => ({
            token,
            user,
            username: user?.username ?? null,
            isAuthenticated: user != null,
            isLoading,
            login,
            register,
            logout,
            authHeader,
        }),
        [token, user, isLoading, login, register, logout, authHeader],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
    return ctx;
}
