import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { useChatStore } from "@/stores/chat-store.js";
import { useSessionStore } from "@/stores/session-store.js";
import { resolveSessionToken } from "@/lib/oauth-provider.js";

/** MCP direct client: talks Streamable HTTP straight to the backend,
 * bypassing the LLM chat loop. The Bearer token is the OAuth access token
 * (auto-refreshed) or the password-login JWT — same login as chat — and
 * rides as an Authorization header.
 * Plain functions over explicit (apiUrl, token) args — stores only
 * enter in submitDirectText, mirroring lib/chat-turn.ts. */

const MCP_PATH = "/mcp/";
const CLIENT_NAME = "todoist-ai-cli";
const CLIENT_VERSION = "0.1.0";

interface CachedClient {
    client: Client;
    apiUrl: string;
}

const cache = new Map<string, CachedClient>();

function cacheKey(apiUrl: string, token: string): string {
    return `${apiUrl}\n${token}`;
}

function mcpUrl(apiUrl: string): URL {
    return new URL(apiUrl.replace(/\/$/, "") + MCP_PATH);
}

/** Connect (or reuse) an authenticated MCP client for this apiUrl+token. */
export async function getMcpClient(apiUrl: string, token: string): Promise<Client> {
    if (!token) throw new Error("Not logged in — /logout then log in again.");
    // OAuth access tokens expire: refresh transparently when possible.
    const fresh = await resolveSessionToken(apiUrl, token);
    if (!fresh) throw new Error("Not logged in — /logout then log in again.");
    if (fresh !== token) useSessionStore.getState().setToken(fresh);
    const key = cacheKey(apiUrl, fresh);
    const hit = cache.get(key);
    if (hit) return hit.client;
    const transport = new StreamableHTTPClientTransport(mcpUrl(apiUrl), {
        requestInit: { headers: { Authorization: `Bearer ${fresh}` } },
    });
    const client = new Client({ name: CLIENT_NAME, version: CLIENT_VERSION });
    try {
        await client.connect(transport);
    } catch (e) {
        throw new Error(`MCP connect failed at ${mcpUrl(apiUrl)} (${mcpMessage(e)})`);
    }
    cache.set(key, { client, apiUrl });
    return client;
}

/** Drop all cached MCP connections (call on logout / token change). */
export async function closeMcpClients(): Promise<void> {
    const clients = [...cache.values()];
    cache.clear();
    for (const { client } of clients) {
        try {
            await client.close();
        } catch {
            // ignore — best effort cleanup
        }
    }
}

function mcpMessage(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

interface TextItem {
    type: string;
    text?: unknown;
}

function isTextItem(item: unknown): item is TextItem {
    return typeof item === "object" && item !== null && "type" in item;
}

/** Pull printable text out of a call_tool result (text blocks joined). */
export function toolText(result: unknown): string {
    if (typeof result === "object" && result !== null && "content" in result) {
        const content = (result as { content?: unknown }).content;
        if (Array.isArray(content)) {
            const parts: string[] = [];
            for (const item of content) {
                if (isTextItem(item) && item.type === "text" && typeof item.text === "string") {
                    parts.push(item.text);
                }
            }
            if (parts.length > 0) return parts.join("\n");
        }
    }
    return JSON.stringify(result);
}

/** Pull text out of a resources/read result (first content entry). */
export function resourceText(result: unknown): string {
    if (typeof result === "object" && result !== null && "contents" in result) {
        const contents = (result as { contents?: unknown }).contents;
        if (Array.isArray(contents) && contents.length > 0) {
            const first = contents[0] as { text?: unknown };
            if (typeof first.text === "string") return first.text;
            return JSON.stringify(first);
        }
    }
    return JSON.stringify(result);
}

interface TodoRow {
    id: number;
    task: string;
    completed: boolean;
    todo_date: string;
}

interface TodoListJson {
    open?: unknown;
    done?: unknown;
    error?: unknown;
    todos?: unknown;
}

function isTodoRow(row: unknown): row is TodoRow {
    return (
        typeof row === "object" &&
        row !== null &&
        typeof (row as TodoRow).id === "number" &&
        typeof (row as TodoRow).task === "string"
    );
}

/** Render list_todos_structured / todo://todos JSON as chat bullets. */
export function formatTodoListJson(raw: string): string {
    let data: TodoListJson;
    try {
        data = JSON.parse(raw) as TodoListJson;
    } catch {
        return raw;
    }
    if (typeof data.error === "string" && (!Array.isArray(data.todos) || data.todos.length === 0)) {
        return `MCP error: ${data.error}`;
    }
    const todos = Array.isArray(data.todos) ? data.todos.filter(isTodoRow) : [];
    if (todos.length === 0) return "No tasks found.";
    const lines = [`${String(data.open ?? "?")} open, ${String(data.done ?? "?")} done:`];
    for (const t of todos) {
        lines.push(`• ${t.completed ? "✅" : "❌"} ${t.task} (ID: ${t.id}, ${t.todo_date})`);
    }
    return lines.join("\n");
}

/** Render a single todo://todos/{id} JSON payload as one line. */
export function formatTodoJson(raw: string): string {
    let data: unknown;
    try {
        data = JSON.parse(raw) as unknown;
    } catch {
        return raw;
    }
    if (typeof data === "object" && data !== null && "error" in data) {
        return `MCP error: ${String((data as { error: unknown }).error)}`;
    }
    if (isTodoRow(data)) {
        return `• ${data.completed ? "✅" : "❌"} ${data.task} (ID: ${data.id}, ${data.todo_date})`;
    }
    return raw;
}

export function parseTodoId(arg: string): number | null {
    const id = Number(arg.trim());
    return Number.isInteger(id) && id > 0 ? id : null;
}

async function callText(client: Client, name: string, args: Record<string, unknown>): Promise<string> {
    try {
        return toolText(await client.callTool({ name, arguments: args }));
    } catch (e) {
        throw new Error(`MCP ${name} failed (${mcpMessage(e)})`);
    }
}

export async function mcpStatus(apiUrl: string, token: string): Promise<string> {
    const client = await getMcpClient(apiUrl, token);
    const [tools, resources, prompts] = await Promise.all([
        client.listTools(),
        client.listResources(),
        client.listPrompts(),
    ]);
    const version = client.getServerVersion();
    const name = version?.name ?? "MCP server";
    return `MCP direct: connected to ${name} at ${mcpUrl(apiUrl)} · ${tools.tools.length} tools · ${resources.resources.length} resources · ${prompts.prompts.length} prompts`;
}

export async function mcpListTools(apiUrl: string, token: string): Promise<string> {
    const client = await getMcpClient(apiUrl, token);
    const { tools } = await client.listTools();
    if (tools.length === 0) return "MCP tools: (none)";
    return ["MCP tools:", ...tools.map((t) => `• ${t.name}${t.description ? ` — ${t.description}` : ""}`)].join("\n");
}

export async function mcpListResources(apiUrl: string, token: string): Promise<string> {
    const client = await getMcpClient(apiUrl, token);
    const [{ resources }, { resourceTemplates }] = await Promise.all([
        client.listResources(),
        client.listResourceTemplates(),
    ]);
    const lines = ["MCP resources:"];
    for (const r of resources) lines.push(`• ${r.uri}${r.name ? ` (${r.name})` : ""}`);
    for (const t of resourceTemplates) lines.push(`• ${t.uriTemplate} (template)`);
    return lines.length > 1 ? lines.join("\n") : "MCP resources: (none)";
}

export async function mcpListPrompts(apiUrl: string, token: string): Promise<string> {
    const client = await getMcpClient(apiUrl, token);
    const { prompts } = await client.listPrompts();
    if (prompts.length === 0) return "MCP prompts: (none)";
    return ["MCP prompts:", ...prompts.map((p) => `• ${p.name}${p.description ? ` — ${p.description}` : ""}`)].join(
        "\n",
    );
}

export async function mcpList(apiUrl: string, token: string, query?: string): Promise<string> {
    const client = await getMcpClient(apiUrl, token);
    const args: Record<string, unknown> = {};
    if (query && query.trim()) args["query"] = query.trim();
    return formatTodoListJson(await callText(client, "list_todos_structured", args));
}

export async function mcpRead(apiUrl: string, token: string, id: number): Promise<string> {
    const client = await getMcpClient(apiUrl, token);
    try {
        return formatTodoJson(resourceText(await client.readResource({ uri: `todo://todos/${id}` })));
    } catch (e) {
        throw new Error(`MCP read todo #${id} failed (${mcpMessage(e)})`);
    }
}

export async function mcpAdd(apiUrl: string, token: string, task: string): Promise<string> {
    const client = await getMcpClient(apiUrl, token);
    return await callText(client, "add_todo", { task });
}

export async function mcpSetDone(apiUrl: string, token: string, id: number, completed: boolean): Promise<string> {
    const client = await getMcpClient(apiUrl, token);
    return await callText(client, "update_todo", { todo_id: id, completed });
}

export async function mcpArchive(apiUrl: string, token: string, id: number): Promise<string> {
    const client = await getMcpClient(apiUrl, token);
    return await callText(client, "archive_todo", { todo_id: id });
}

export async function mcpDelete(apiUrl: string, token: string, id: number): Promise<string> {
    const client = await getMcpClient(apiUrl, token);
    return await callText(client, "delete_todo", { todo_id: id });
}

/** Direct-mode submit: plain text runs a read-only MCP list (fuzzy query),
 * bypassing the LLM entirely. Write ops stay on explicit slash commands. */
export async function submitDirectText(text: string): Promise<void> {
    const session = useSessionStore.getState();
    const chat = useChatStore.getState();
    if (!session.token) return;
    chat.setStatus("MCP: listing…");
    try {
        chat.pushSystem(await mcpList(session.apiUrl, session.token, text));
        chat.setStatus("Ready (MCP direct — plain text lists, /add /done write).");
    } catch (e) {
        chat.pushSystem(e instanceof Error ? e.message : String(e));
        chat.setStatus("MCP direct failed.");
    }
}
