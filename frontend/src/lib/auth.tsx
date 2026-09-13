import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  UNAUTHORIZED_EVENT,
  clearSession,
  getToken,
  getUsername,
  loginUser,
  registerUser,
  setSession,
} from "./api";

interface AuthContextValue {
  token: string | null;
  username: string | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
  /** Raw token for future MCP chat requests (`Authorization: Bearer <token>`). */
  authHeader: () => Record<string, string>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getToken());
  const [username, setUsername] = useState<string | null>(() => getUsername());

  const logout = useCallback(() => {
    clearSession();
    setToken(null);
    setUsername(null);
  }, []);

  // Auto-logout when apiFetch sees a 401 (expired/invalid token).
  useEffect(() => {
    const onUnauthorized = () => {
      setToken(null);
      setUsername(null);
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const login = useCallback(async (name: string, password: string) => {
    const data = await loginUser(name, password);
    setSession(data.access_token, name);
    setToken(data.access_token);
    setUsername(name);
  }, []);

  const register = useCallback(async (name: string, password: string) => {
    await registerUser(name, password);
    // Backend register returns only a message, so log in right after.
    const data = await loginUser(name, password);
    setSession(data.access_token, name);
    setToken(data.access_token);
    setUsername(name);
  }, []);

  const authHeader = useCallback((): Record<string, string> => {
    const t = getToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      username,
      isAuthenticated: token != null,
      login,
      register,
      logout,
      authHeader,
    }),
    [token, username, login, register, logout, authHeader],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
