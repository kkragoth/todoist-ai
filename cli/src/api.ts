import type { ChatEvent } from "@/types.js";

async function readJson(res: Response): Promise<unknown> {
    try {
        return await res.json();
    } catch {
        return null;
    }
}

export function authHeaders(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
}

export type MeResult = { status: "ok"; username: string } | { status: "invalid" } | { status: "unreachable" };

export async function apiMe(apiUrl: string, token: string): Promise<MeResult> {
    let res: Response;
    try {
        res = await fetch(`${apiUrl}/auth/me`, { headers: authHeaders(token) });
    } catch {
        return { status: "unreachable" };
    }
    if (res.ok) {
        const data = (await readJson(res)) as { username?: string } | null;
        if (data && typeof data.username === "string") {
            return { status: "ok", username: data.username };
        }
        return { status: "invalid" };
    }
    return { status: "invalid" };
}

export async function apiLogin(apiUrl: string, username: string, password: string): Promise<string> {
    const body = new URLSearchParams({ username, password });
    const res = await fetch(`${apiUrl}/auth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`login failed (${res.status}): ${text.slice(0, 200)}`);
    }
    const data = (await readJson(res)) as { access_token?: string } | null;
    if (!data || typeof data.access_token !== "string") {
        throw new Error("login response missing access_token");
    }
    return data.access_token;
}

export async function apiRegister(apiUrl: string, username: string, password: string): Promise<void> {
    const res = await fetch(`${apiUrl}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`register failed (${res.status}): ${text.slice(0, 200)}`);
    }
}

export async function apiClearHistory(apiUrl: string, token: string, threadId: string): Promise<void> {
    const res = await fetch(`${apiUrl}/api/chat/history?thread_id=${encodeURIComponent(threadId)}`, {
        method: "DELETE",
        headers: authHeaders(token),
    });
    if (res.status === 404) {
        throw new Error(`thread ${threadId} not found on the server.`);
    }
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`clear failed (${res.status}): ${text.slice(0, 200)}`);
    }
}

export async function apiListThreads(apiUrl: string, token: string): Promise<ThreadSummary[]> {
    const res = await fetch(`${apiUrl}/api/chat/threads`, {
        headers: authHeaders(token),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`threads failed (${res.status}): ${text.slice(0, 200)}`);
    }
    return (await res.json()) as ThreadSummary[];
}

export interface TurnParams {
    apiUrl: string;
    token: string;
    message: string;
    /** Numeric thread id as string; omit to continue the most recent thread. */
    threadId?: string;
    provider?: string;
    model?: string;
    signal?: AbortSignal;
}

export interface ThreadSummary {
    thread_id: number;
    title: string;
    message_count: number;
    updated_at?: string | null;
}

/** Open a turn: POSTs and returns the resolved numeric thread id
 * (X-Chat-Thread-Id) plus the SSE event stream. */
export async function openChatTurn(params: TurnParams): Promise<{
    threadId: string | null;
    events: AsyncGenerator<ChatEvent>;
}> {
    const res = await fetch(`${params.apiUrl}/api/chat`, {
        method: "POST",
        headers: {
            ...authHeaders(params.token),
            "Content-Type": "application/json",
            Accept: "text/event-stream",
        },
        body: JSON.stringify({
            message: params.message,
            ...(params.threadId ? { thread_id: params.threadId } : {}),
            ...(params.provider ? { provider: params.provider } : {}),
            ...(params.model ? { model: params.model } : {}),
        }),
        signal: params.signal,
    });
    const resolvedThread = res.headers.get("X-Chat-Thread-Id");

    async function* events(): AsyncGenerator<ChatEvent> {
        if (!res.ok || !res.body) {
            const text = await res.text().catch(() => "");
            yield { type: "error", message: `chat request failed (${res.status}): ${text.slice(0, 300)}` };
            return;
        }
        yield* readSse(res.body);
    }

    return { threadId: resolvedThread, events: events() };
}

/** POST /api/chat and yield typed SSE events (`data: {...}` frames). */
export async function* streamChatTurn(params: TurnParams): AsyncGenerator<ChatEvent> {
    const { events } = await openChatTurn(params);
    yield* events;
}

async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<ChatEvent> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            let sep: number;
            while ((sep = buf.indexOf("\n\n")) >= 0) {
                const frame = buf.slice(0, sep);
                buf = buf.slice(sep + 2);
                for (const line of frame.split("\n")) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith("data:")) continue;
                    const payload = trimmed.slice(5).trim();
                    if (!payload) continue;
                    try {
                        const evt = JSON.parse(payload) as ChatEvent;
                        if (evt && typeof evt.type === "string") yield evt;
                    } catch {
                        // skip malformed frame
                    }
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
}
