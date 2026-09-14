import { useEffect, useState } from "react";
import { apiListThreads } from "@/api.js";
import type { ThreadSummary } from "@/api.js";
import type { Command } from "@/components/ui/command-palette.js";
import { CommandPalette } from "@/components/ui/command-palette.js";
import { useChatStore } from "@/stores/chat-store.js";
import { useSessionUiStore } from "@/stores/session-ui-store.js";
import { useSessionStore } from "@/stores/session-store.js";

/** Searchable session picker (termcn CommandPalette): fuzzy-filter previous
 * threads, resume one, or start a fresh session. Opened via /sessions. */
export function SessionPalette() {
    const open = useSessionUiStore((s) => s.paletteOpen);
    const setOpen = useSessionUiStore((s) => s.setPaletteOpen);
    const [threads, setThreads] = useState<ThreadSummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!open) return;
        const session = useSessionStore.getState();
        if (!session.token) return;
        let cancelled = false;
        setLoading(true);
        setError("");
        void apiListThreads(session.apiUrl, session.token)
            .then((rows) => {
                if (!cancelled) setThreads(rows);
            })
            .catch((e) => {
                if (!cancelled) setError(e instanceof Error ? e.message : String(e));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [open]);

    function startNewSession() {
        const session = useSessionStore.getState();
        const chat = useChatStore.getState();
        session.setThreadId("");
        chat.clearFeed();
        chat.pushSystem("New session — send a message to start a fresh thread.");
    }

    function resumeThread(id: number, title: string) {
        const session = useSessionStore.getState();
        const chat = useChatStore.getState();
        session.setThreadId(String(id));
        chat.clearFeed();
        chat.pushSystem(`Resumed thread ${id} — ${title}.`);
    }

    const currentThreadId = useSessionStore((s) => s.threadId);

    const commands: Command[] = loading
        ? [{ id: "__loading__", label: "Loading sessions…", group: "Sessions" }]
        : [
              {
                  id: "__new__",
                  label: "+ New session",
                  description: "start a fresh thread",
                  group: "Actions",
                  onSelect: () => startNewSession(),
              },
              ...(error
                  ? [
                        {
                            id: "__error__",
                            label: `Couldn't load threads: ${error.slice(0, 80)}`,
                            group: "Sessions",
                        } as Command,
                    ]
                  : threads.map((t) => ({
                        id: `thread-${t.thread_id}`,
                        label: `${String(t.thread_id) === currentThreadId ? "● " : ""}#${t.thread_id} ${t.title} (${t.message_count} msgs)`,
                        description:
                            String(t.thread_id) === currentThreadId
                                ? "current"
                                : t.updated_at
                                  ? `updated ${t.updated_at}`
                                  : undefined,
                        group: "Sessions",
                        onSelect: () => resumeThread(t.thread_id, t.title),
                    }))),
          ];

    return (
        <CommandPalette
            isOpen={open}
            onClose={() => setOpen(false)}
            commands={commands}
            placeholder="Search sessions…"
            maxItems={10}
        />
    );
}
