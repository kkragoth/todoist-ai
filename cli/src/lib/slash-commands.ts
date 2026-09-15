import { apiClearHistory, apiListThreads } from "@/api.js";
import {
    closeMcpClients,
    mcpAdd,
    mcpArchive,
    mcpDelete,
    mcpList,
    mcpListPrompts,
    mcpListResources,
    mcpListTools,
    mcpRead,
    mcpSetDone,
    mcpStatus,
    parseTodoId,
} from "@/lib/mcp-direct.js";
import { parseSlash } from "@/lib/slash.js";
import { isThreadId } from "@/lib/text.js";
import { useAuthStore } from "@/stores/auth-store.js";
import { useChatStore } from "@/stores/chat-store.js";
import { useSessionUiStore } from "@/stores/session-ui-store.js";
import { useSessionStore } from "@/stores/session-store.js";

/** Slash-command execution over the stores. Pure parsing lives in lib/slash.ts. */
export async function handleSlashCommand(raw: string): Promise<void> {
    const parsed = parseSlash(raw);
    if (!parsed) return;
    const session = useSessionStore.getState();
    const chat = useChatStore.getState();
    const { name, arg } = parsed;
    /** Auth guard for MCP-direct commands (same JWT file as chat). */
    const mcpAuth = (): { apiUrl: string; token: string } | null => {
        const s = useSessionStore.getState();
        if (!s.token) {
            useChatStore.getState().pushSystem("Not logged in — log in first.");
            return null;
        }
        return { apiUrl: s.apiUrl, token: s.token };
    };
    /** Run one MCP-direct op and print the result (bypasses the LLM). */
    const runMcp = async (fn: (auth: { apiUrl: string; token: string }) => Promise<string>): Promise<void> => {
        const auth = mcpAuth();
        if (!auth) return;
        try {
            useChatStore.getState().pushSystem(await fn(auth));
        } catch (e) {
            useChatStore.getState().pushSystem(e instanceof Error ? e.message : String(e));
        }
    };
    const needId = (what: string): number | null => {
        const id = parseTodoId(arg);
        if (id === null) chat.pushSystem(`Usage: /${what} <id> — pick an ID from /list.`);
        return id;
    };
    switch (name) {
        case "help":
            chat.pushSystem(
                "/clear · /thread [id] · /threads · /sessions · /provider [name] · /model [name] · /logout · /quit — esc cancels a turn",
            );
            chat.pushSystem(
                "MCP direct (bypasses LLM): /mcp [on|off|status] · /tools · /resources · /prompts · /list [query] · /read <id> · /add <task> · /done <id> · /reopen <id> · /archive <id> · /delete <id>",
            );
            break;
        case "clear": {
            if (!session.token) break;
            if (!session.threadId) {
                chat.pushSystem("No thread yet — send a message first, then /clear.");
                break;
            }
            try {
                await apiClearHistory(session.apiUrl, session.token, session.threadId);
                chat.clearFeed();
                chat.pushSystem(`History cleared for thread ${session.threadId}.`);
            } catch (e) {
                chat.pushSystem(e instanceof Error ? e.message : String(e));
            }
            break;
        }
        case "thread":
            if (!arg) {
                chat.pushSystem(
                    session.threadId
                        ? `Current thread: ${session.threadId}. Usage: /thread <id>`
                        : "No thread yet — send a message first.",
                );
            } else if (!isThreadId(arg)) {
                chat.pushSystem(`Threads are numeric — use /threads to list, then /thread <id>.`);
            } else {
                session.setThreadId(arg);
                chat.pushSystem(`Switched to thread ${arg}.`);
            }
            break;
        case "threads": {
            if (!session.token) break;
            try {
                const rows = await apiListThreads(session.apiUrl, session.token);
                if (rows.length === 0) {
                    chat.pushSystem("No threads yet.");
                } else {
                    for (const r of rows) {
                        chat.pushSystem(
                            `${r.thread_id} · ${r.title} (${r.message_count} msgs)${String(r.thread_id) === session.threadId ? " ← current" : ""}`,
                        );
                    }
                    chat.pushSystem("Tip: /sessions opens a searchable picker.");
                }
            } catch (e) {
                chat.pushSystem(e instanceof Error ? e.message : String(e));
            }
            break;
        }
        case "sessions":
            if (!session.token) break;
            useSessionUiStore.getState().setPaletteOpen(true);
            break;
        case "provider":
            if (!arg) {
                chat.pushSystem(
                    `Provider: ${session.provider ?? "(server default)"}. Usage: /provider ollama|llamacpp|openrouter`,
                );
            } else {
                session.setProvider(arg);
                chat.pushSystem(`Provider set to "${arg}".`);
            }
            break;
        case "model":
            if (!arg) {
                chat.pushSystem(`Model: ${session.model ?? "(server default)"}. Usage: /model <name>`);
            } else {
                session.setModel(arg);
                chat.pushSystem(`Model set to "${arg}".`);
            }
            break;
        case "logout":
            session.signOut();
            void closeMcpClients();
            chat.clearFeed();
            useAuthStore.getState().reset();
            break;
        case "quit":
        case "exit":
            process.exit(0);
            break;
        case "mcp": {
            const mode = arg.toLowerCase();
            if (mode === "on") {
                session.setMcpDirect(true);
                chat.pushSystem(
                    "MCP direct mode ON — plain text lists via MCP, /add /done write. /mcp off for LLM chat.",
                );
            } else if (mode === "off") {
                session.setMcpDirect(false);
                chat.pushSystem("MCP direct mode OFF — plain text goes to the LLM again.");
            } else if (mode === "" || mode === "status") {
                await runMcp((auth) => mcpStatus(auth.apiUrl, auth.token));
                chat.pushSystem(
                    session.mcpDirect
                        ? "Direct mode is ON (plain text bypasses the LLM)."
                        : "Direct mode is OFF (plain text goes to the LLM).",
                );
            } else {
                chat.pushSystem("Usage: /mcp [on|off|status]");
            }
            break;
        }
        case "tools":
            await runMcp((auth) => mcpListTools(auth.apiUrl, auth.token));
            break;
        case "resources":
            await runMcp((auth) => mcpListResources(auth.apiUrl, auth.token));
            break;
        case "prompts":
            await runMcp((auth) => mcpListPrompts(auth.apiUrl, auth.token));
            break;
        case "list":
            await runMcp((auth) => mcpList(auth.apiUrl, auth.token, arg || undefined));
            break;
        case "read": {
            const id = needId("read");
            if (id !== null) await runMcp((auth) => mcpRead(auth.apiUrl, auth.token, id));
            break;
        }
        case "add":
            if (!arg) {
                chat.pushSystem("Usage: /add <task> — e.g. /add buy milk");
            } else {
                await runMcp((auth) => mcpAdd(auth.apiUrl, auth.token, arg));
            }
            break;
        case "done": {
            const id = needId("done");
            if (id !== null) await runMcp((auth) => mcpSetDone(auth.apiUrl, auth.token, id, true));
            break;
        }
        case "reopen": {
            const id = needId("reopen");
            if (id !== null) await runMcp((auth) => mcpSetDone(auth.apiUrl, auth.token, id, false));
            break;
        }
        case "archive": {
            const id = needId("archive");
            if (id !== null) await runMcp((auth) => mcpArchive(auth.apiUrl, auth.token, id));
            break;
        }
        case "delete": {
            const id = needId("delete");
            if (id !== null) await runMcp((auth) => mcpDelete(auth.apiUrl, auth.token, id));
            break;
        }
        default:
            chat.pushSystem(`Unknown command "/${name}". Try /help.`);
            break;
    }
}
