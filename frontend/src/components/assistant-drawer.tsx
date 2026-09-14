import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTodosUiStore } from "@/stores/todos-ui-store";

interface ChatMessage {
    id: number;
    role: "assistant" | "user";
    text: string;
}

const SUGGESTIONS = ["add tomorrow to clean up my room", "what are my today tasks?"];

let nextId = 1;
function makeMessage(role: ChatMessage["role"], text: string): ChatMessage {
    nextId += 1;
    return { id: nextId, role, text };
}

function mockReply(input: string): string {
    const lower = input.toLowerCase();
    if (lower.startsWith("add")) {
        return "Mocked for now — I noted that down. Wiring to the real assistant comes later.";
    }
    if (lower.includes("today")) {
        return "Mocked for now — I would filter the list to Today. Wiring to the real assistant comes later.";
    }
    if (lower.includes("overdue")) {
        return "Mocked for now — I would filter the list to Overdue. Wiring to the real assistant comes later.";
    }
    return "Mocked for now — I can add tasks, reschedule or filter the list once wired up. Try a suggestion below.";
}

export function AssistantDrawer() {
    const open = useTodosUiStore((s) => s.assistantOpen);
    const setOpen = useTodosUiStore((s) => s.setAssistantOpen);
    const [messages, setMessages] = useState<ChatMessage[]>([
        makeMessage("assistant", "Ask me to add, reschedule, or find tasks — I'll drive the same filters and list."),
    ]);
    const [draft, setDraft] = useState("");
    const bodyRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
    }, [messages, open]);

    function send(text: string) {
        const trimmed = text.trim();
        if (!trimmed) return;
        setMessages((prev) => [...prev, makeMessage("user", trimmed)]);
        setDraft("");
        window.setTimeout(() => {
            setMessages((prev) => [...prev, makeMessage("assistant", mockReply(trimmed))]);
        }, 300);
    }

    return (
        <AnimatePresence>
            {open && (
                <>
                    <motion.div
                        className="fixed inset-0 z-30 bg-black/20"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setOpen(false)}
                    />
                    <motion.aside
                        className="fixed top-0 right-0 bottom-0 z-40 flex w-full max-w-sm flex-col border-l border-border bg-card shadow-xl"
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ type: "spring", stiffness: 380, damping: 38 }}
                        role="dialog"
                        aria-label="Assistant"
                    >
                        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
                            <p className="flex items-center gap-2 text-sm font-semibold">
                                <span className="size-2 rounded-full bg-sky-500" />
                                Assistant
                                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                    mocked
                                </span>
                            </p>
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => setOpen(false)}
                                aria-label="Close assistant"
                            >
                                <X />
                            </Button>
                        </div>
                        <div ref={bodyRef} className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
                            {messages.map((msg) =>
                                msg.role === "user" ? (
                                    <div
                                        key={msg.id}
                                        className="max-w-[88%] self-end rounded-xl rounded-br-sm border border-border/60 bg-muted px-3 py-2 text-sm"
                                    >
                                        {msg.text}
                                    </div>
                                ) : (
                                    <div key={msg.id} className="max-w-[92%] self-start text-sm text-muted-foreground">
                                        {msg.text}
                                    </div>
                                ),
                            )}
                        </div>
                        <div className="flex flex-col gap-1.5 px-3 pb-2">
                            {SUGGESTIONS.map((suggestion) => (
                                <button
                                    key={suggestion}
                                    type="button"
                                    onClick={() => send(suggestion)}
                                    className="rounded-lg border border-dashed border-border px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:border-sky-500 hover:text-sky-600"
                                >
                                    {suggestion}
                                </button>
                            ))}
                        </div>
                        <form
                            className="flex items-center gap-2 border-t border-border/60 p-3"
                            onSubmit={(e) => {
                                e.preventDefault();
                                send(draft);
                            }}
                        >
                            <input
                                className="h-9 flex-1 rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                                placeholder="Tell it what to do, or ask what's due…"
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                            />
                            <Button type="submit" size="icon" disabled={!draft.trim()} aria-label="Send to assistant">
                                <Send />
                            </Button>
                        </form>
                    </motion.aside>
                </>
            )}
        </AnimatePresence>
    );
}

export function AskAssistantButton() {
    const setOpen = useTodosUiStore((s) => s.setAssistantOpen);
    return (
        <Button variant="outline" size="xs" className="bg-card" onClick={() => setOpen(true)}>
            <Sparkles />
            Ask assistant
        </Button>
    );
}
