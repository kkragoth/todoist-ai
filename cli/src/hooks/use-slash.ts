import { apiClearHistory, apiListThreads } from "@/api.js";
import { parseSlash } from "@/lib/slash.js";
import { isThreadId } from "@/lib/text.js";
import { useChatStore } from "@/stores/chat-store.js";
import { useSessionStore } from "@/stores/session-store.js";

/** Slash-command execution wired to the stores. Pure parsing lives in lib/slash.ts. */
export function useSlashCommands(options: { onLogout: () => void }): (raw: string) => Promise<void> {
    return async function handleSlash(raw: string): Promise<void> {
        const parsed = parseSlash(raw);
        if (!parsed) return;
        const session = useSessionStore.getState();
        const chat = useChatStore.getState();
        const { name, arg } = parsed;
        switch (name) {
            case "help":
                chat.pushSystem(
                    "/clear · /thread [id] · /threads · /provider [name] · /model [name] · /logout · /quit — esc cancels a turn",
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
                    if (rows.length === 0) chat.pushSystem("No threads yet.");
                    else {
                        for (const r of rows) {
                            chat.pushSystem(
                                `${r.thread_id} · ${r.title} (${r.message_count} msgs)${String(r.thread_id) === session.threadId ? " ← current" : ""}`,
                            );
                        }
                    }
                } catch (e) {
                    chat.pushSystem(e instanceof Error ? e.message : String(e));
                }
                break;
            }
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
                chat.clearFeed();
                options.onLogout();
                break;
            case "quit":
            case "exit":
                process.exit(0);
                break;
            default:
                chat.pushSystem(`Unknown command "/${name}". Try /help.`);
                break;
        }
    };
}
