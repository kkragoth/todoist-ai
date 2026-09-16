import { useEffect, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Send, Square, X } from "lucide-react";
import { AssistantMessages } from "@/components/assistant/AssistantMessages";
import { CleanupRoomButton } from "@/components/assistant/CleanupRoomButton";
import { StarterSuggestions } from "@/components/assistant/StarterSuggestions";
import { Button } from "@/components/ui/button";
import { AssistantSendProvider } from "@/lib/assistant-send";
import { cancelAssistantTurn, startAssistantTurn } from "@/lib/assistant-turn";
import { applyUiAction, buildUiState, type UiActionDeps } from "@/lib/assistant-ui-action";
import { UiActionKind } from "@/lib/chat";
import { useAssistantStore } from "@/stores/assistant-store";
import { useTodosUiStore } from "@/stores/todos-ui-store";

const SUGGESTIONS = ["add tomorrow to clean up my room", "what are my today tasks?"];

export function AssistantSidebar() {
    const setOpen = useTodosUiStore((s) => s.setAssistantOpen);
    const messages = useAssistantStore((s) => s.messages);
    const busy = useAssistantStore((s) => s.busy);
    const status = useAssistantStore((s) => s.status);
    const navigate = useNavigate();
    const locationSearch = useRouterState({ select: (s) => s.location.search });
    const [draft, setDraft] = useState("");
    const bodyRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef(locationSearch);
    useEffect(() => {
        searchRef.current = locationSearch;
    }, [locationSearch]);

    useEffect(() => {
        bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
    }, [messages]);

    function deps(): UiActionDeps {
        const ui = useTodosUiStore.getState();
        return {
            search: (searchRef.current ?? {}) as Record<string, unknown>,
            ui: {
                view: ui.view,
                listSort: ui.listSort,
                density: ui.density,
                setView: ui.setView,
                setListSort: ui.setListSort,
                setDensity: ui.setDensity,
            },
            navigate: (to, search) => void navigate({ to, search }),
        };
    }

    function getUiState(): Record<string, unknown> {
        const ui = useTodosUiStore.getState();
        return buildUiState((searchRef.current ?? {}) as Record<string, unknown>, {
            view: ui.view,
            listSort: ui.listSort,
            density: ui.density,
        });
    }

    function handleUiAction(action: UiActionKind, args: Record<string, unknown>): string {
        return applyUiAction(action, args, deps());
    }

    function send(text: string) {
        const trimmed = text.trim();
        if (!trimmed || busy) return;
        setDraft("");
        void startAssistantTurn(trimmed, { getUiState, applyUiAction: handleUiAction });
    }

    return (
        <AssistantSendProvider send={send}>
            <motion.aside
                className="flex min-h-0 w-full flex-col border-t border-border bg-card max-lg:h-[45svh] max-lg:shrink-0 lg:w-96 lg:shrink-0 lg:rounded-xl lg:border"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 24 }}
                transition={{ duration: 0.2 }}
                aria-label="Assistant"
            >
                <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                        <span className="size-2 rounded-full bg-sky-500 dark:bg-assistant-blue" />
                        Assistant
                    </p>
                    <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Close assistant">
                        <X />
                    </Button>
                </div>
                <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
                    <AssistantMessages messages={messages} />
                    {busy && <p className="self-start text-xs text-muted-foreground">{status}</p>}
                </div>
                {!busy && messages.length <= 2 && <StarterSuggestions suggestions={SUGGESTIONS} />}
                {!busy && <CleanupRoomButton />}
                <form
                    className="flex items-center gap-2 border-t border-border/60 p-3"
                    onSubmit={(e) => {
                        e.preventDefault();
                        send(draft);
                    }}
                >
                    {busy && (
                        <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            onClick={cancelAssistantTurn}
                            aria-label="Stop assistant"
                        >
                            <Square />
                        </Button>
                    )}
                    <input
                        id="assistant-input"
                        className="h-9 flex-1 rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        placeholder="Tell it what to do, or ask what's due…"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        disabled={busy}
                    />
                    <Button type="submit" size="icon" disabled={busy || !draft.trim()} aria-label="Send to assistant">
                        <Send />
                    </Button>
                </form>
            </motion.aside>
        </AssistantSendProvider>
    );
}
