// Central HTTP client for the todo backend (and future MCP chat).
//
// - Base URL: `VITE_API_URL` if set, otherwise same-origin (works with the
//   Vite dev proxy for `/auth` + `/api` -> http://localhost:8000).
// - Token is kept in localStorage so it survives reloads.
// - Any 401 response clears the token and notifies the app (AuthProvider
//   listens for this and redirects to /login).

export const TOKEN_KEY = "todoist-ai.token";
export const USERNAME_KEY = "todoist-ai.username";

export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

/** Event fired when the backend rejects our token. */
export const UNAUTHORIZED_EVENT = "todoist-ai:unauthorized";

export function getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
}

export function getUsername(): string | null {
    return localStorage.getItem(USERNAME_KEY);
}

export function setSession(token: string, username: string) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USERNAME_KEY, username);
}

export function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USERNAME_KEY);
}

function notifyUnauthorized() {
    clearSession();
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
}

export class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

type ApiOptions = Omit<RequestInit, "headers"> & {
    /** Set false for login/register which carry no token. */
    auth?: boolean;
    headers?: Record<string, string>;
};

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
    const { auth = true, headers = {}, ...init } = options;

    const finalHeaders: Record<string, string> = { ...headers };
    if (auth) {
        const token = getToken();
        if (!token) {
            notifyUnauthorized();
            throw new ApiError(401, "Not authenticated");
        }
        finalHeaders.Authorization = `Bearer ${token}`;
    }
    if (init.body != null && !(init.body instanceof URLSearchParams) && !(init.body instanceof FormData)) {
        finalHeaders["Content-Type"] ??= "application/json";
    }

    const res = await fetch(`${API_BASE}${path}`, { ...init, headers: finalHeaders });

    if (res.status === 401) {
        notifyUnauthorized();
        throw new ApiError(401, "Session expired — please log in again.");
    }
    if (!res.ok) {
        let detail = `Request failed (${res.status})`;
        try {
            const data = await res.json();
            if (typeof data?.detail === "string") detail = data.detail;
            else if (Array.isArray(data?.detail))
                detail = data.detail.map((d: { msg?: string }) => d.msg ?? JSON.stringify(d)).join(", ");
        } catch {
            // keep default message
        }
        throw new ApiError(res.status, detail);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
}

// ---- Backend types (mirror backend/src/todo + auth) ----

export interface TokenResponse {
    access_token: string;
    token_type: string;
}

export interface UserProfile {
    id: number;
    username: string;
}

export interface Todo {
    id: number;
    task: string;
    completed: boolean;
    archived: boolean;
    user_id: number;
    created_at: string;
    todo_date: string; // YYYY-MM-DD
}

export interface TodoCreate {
    task: string;
    todo_date?: string | null;
}

/** Backend PATCH supports reschedule / (un)complete / (un)archive. No rename, no hard delete. */
export interface TodoUpdate {
    todo_date?: string | null;
    completed?: boolean | null;
    archived?: boolean | null;
}

export interface TodosQuery {
    completed?: boolean;
    includeArchived?: boolean;
    targetDate?: string;
    dateFrom?: string;
    dateTo?: string;
}

export function buildTodosSearch(params: TodosQuery): string {
    const search = new URLSearchParams();
    if (params.completed !== undefined) search.set("completed", String(params.completed));
    if (params.includeArchived) search.set("include_archived", "true");
    if (params.targetDate) search.set("target_date", params.targetDate);
    if (params.dateFrom) search.set("date_from", params.dateFrom);
    if (params.dateTo) search.set("date_to", params.dateTo);
    const qs = search.toString();
    return qs ? `?${qs}` : "";
}

// ---- Auth endpoints ----

export async function registerUser(username: string, password: string): Promise<{ message: string }> {
    return apiFetch<{ message: string }>("/auth/register", {
        auth: false,
        method: "POST",
        body: JSON.stringify({ username, password }),
    });
}

export async function loginUser(username: string, password: string): Promise<TokenResponse> {
    const form = new URLSearchParams();
    form.set("username", username);
    form.set("password", password);
    return apiFetch<TokenResponse>("/auth/token", {
        auth: false,
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
    });
}

/** Current user profile. Requires a valid Bearer token; 401 means logged out. */
export async function fetchMe(): Promise<UserProfile> {
    return apiFetch<UserProfile>("/auth/me");
}

// ---- Todo endpoints ----

export async function fetchTodos(query: TodosQuery): Promise<Todo[]> {
    return apiFetch<Todo[]>(`/api/todos${buildTodosSearch(query)}`);
}

export async function createTodo(input: TodoCreate): Promise<Todo> {
    return apiFetch<Todo>("/api/todos", {
        method: "POST",
        body: JSON.stringify({ task: input.task, todo_date: input.todo_date ?? null }),
    });
}

export async function patchTodo(id: number, update: TodoUpdate): Promise<Todo> {
    return apiFetch<Todo>(`/api/todos/${id}`, {
        method: "PATCH",
        body: JSON.stringify(update),
    });
}

/** "Delete" = archive, since the backend has no hard-delete endpoint. */
export async function archiveTodo(id: number): Promise<Todo> {
    return patchTodo(id, { archived: true });
}

export async function unarchiveTodo(id: number): Promise<Todo> {
    return patchTodo(id, { archived: false });
}
