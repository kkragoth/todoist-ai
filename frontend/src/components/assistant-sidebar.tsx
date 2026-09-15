import { useEffect, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Send, Square, X } from "lucide-react";
import { AssistantMessages } from "@/components/assistant/AssistantMessages";
import { CleanupRoomButton } from "@/components/assistant/CleanupRoomButton";
import { StarterSuggestions } from "@/components/assistant/StarterSuggestions";
import { Button } from "@/components/ui/button";
import {
    CHAT_HIGHLIGHT_MAX_IDS,
    UiActionKind,
    type HighlightActionArgs,
    type SetFilterActionArgs,
    type SetViewActionArgs,
} from "@/lib/chat";
import { cancelAssistantTurn, startAssistantTurn } from "@/lib/assistant-turn";
import { highlightTodoIds } from "@/lib/highlight-todos";
import {
    parseArchived,
    parseDatePresetStrict,
    parseISODateParam,
    parseSearch,
    parseTodoStatusStrict,
    stripDatesUnlessCustom,
    datePresetLabel,
    statusLabel,
    type TodosSearchParams,
} from "@/lib/todos-filters";
import { densityLabel, parseDensity, parseListSort, parseTodoViewStrict, sortLabel, viewLabel } from "@/lib/todos-view";
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

    function getUiState(): Record<string, unknown> {
        const parsed = parseSearch((searchRef.current ?? {}) as Record<string, unknown>);
        const ui = useTodosUiStore.getState();
        return {
            status: parsed.status,
            date_preset: parsed.date_preset,
            ...(parsed.start_date ? { start_date: parsed.start_date } : {}),
            ...(parsed.end_date ? { end_date: parsed.end_date } : {}),
            archived: parsed.archived,
            view: ui.view,
            sort: ui.listSort,
            density: ui.density,
        };
    }

    function applyUiAction(action: UiActionKind, args: Record<string, unknown>): string {
        switch (action) {
            case UiActionKind.SetFilter: {
                const filterArgs = args as SetFilterActionArgs;
                const current = parseSearch((searchRef.current ?? {}) as Record<string, unknown>);
                const next: TodosSearchParams = { ...current };
                let changed = false;
                if (filterArgs.status !== undefined) {
                    const status = parseTodoStatusStrict(filterArgs.status);
                    if (!status) throw new Error(`bad status ${String(filterArgs.status)}`);
                    next.status = status;
                    changed = true;
                }
                if (filterArgs.date_preset !== undefined) {
                    const preset = parseDatePresetStrict(filterArgs.date_preset);
                    if (!preset) throw new Error(`bad date_preset ${String(filterArgs.date_preset)}`);
                    next.date_preset = preset;
                    changed = true;
                }
                if (filterArgs.start_date !== undefined) {
                    next.start_date = parseISODateParam(filterArgs.start_date);
                    changed = true;
                }
                if (filterArgs.end_date !== undefined) {
                    next.end_date = parseISODateParam(filterArgs.end_date);
                    changed = true;
                }
                if (filterArgs.archived !== undefined) {
                    next.archived = parseArchived(filterArgs.archived);
                    changed = true;
                }
                if (!changed) throw new Error("empty filter change");
                void navigate({ to: "/todos", search: stripDatesUnlessCustom(next) });
                return `Filter → ${datePresetLabel(next.date_preset)} · ${statusLabel(next.status)}${next.archived ? " · archived" : ""}`;
            }
            case UiActionKind.SetView: {
                const viewArgs = args as SetViewActionArgs;
                const ui = useTodosUiStore.getState();
                const applied: string[] = [];
                if (viewArgs.view !== undefined) {
                    const view = parseTodoViewStrict(viewArgs.view);
                    if (!view) throw new Error(`bad view ${String(viewArgs.view)}`);
                    ui.setView(view);
                    applied.push(viewLabel(view));
                }
                if (viewArgs.sort !== undefined) {
                    const sort = parseListSort(viewArgs.sort);
                    if (!sort) throw new Error(`bad sort ${String(viewArgs.sort)}`);
                    ui.setListSort(sort);
                    applied.push(sortLabel(sort));
                }
                if (viewArgs.density !== undefined) {
                    const density = parseDensity(viewArgs.density);
                    if (!density) throw new Error(`bad density ${String(viewArgs.density)}`);
                    ui.setDensity(density);
                    applied.push(densityLabel(density));
                }
                if (applied.length === 0) throw new Error("empty view change");
                return `View → ${applied.join(" · ")}`;
            }
            case UiActionKind.Highlight: {
                const raw = (args as HighlightActionArgs).ids;
                const ids = (Array.isArray(raw) ? raw : [])
                    .map((v) => (typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v))
                    .filter((v): v is number => typeof v === "number" && Number.isInteger(v))
                    .slice(0, CHAT_HIGHLIGHT_MAX_IDS);
                if (ids.length === 0) throw new Error("no valid todo ids");
                highlightTodoIds(ids);
                return `Highlighted ${ids.map((id) => `#${id}`).join(", ")}`;
            }
            default: {
                const _exhaustive: never = action;
                void _exhaustive;
                throw new Error(`unknown ui action ${String(action)}`);
            }
        }
    }

    function send(text: string) {
        const trimmed = text.trim();
        if (!trimmed || busy) return;
        setDraft("");
        void startAssistantTurn(trimmed, { getUiState, applyUiAction });
    }

    return (
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
                <AssistantMessages messages={messages} onSend={send} />
                {busy && <p className="self-start text-xs text-muted-foreground">{status}</p>}
            </div>
            {!busy && messages.length <= 2 && <StarterSuggestions suggestions={SUGGESTIONS} onSend={send} />}
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
    );
}
