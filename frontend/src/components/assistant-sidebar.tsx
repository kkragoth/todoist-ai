import { useEffect, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Send, Sparkles, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FollowUpChips } from "@/components/assistant/FollowUpChips";
import { TodoListWidget } from "@/components/assistant/TodoListWidget";
import { UiActionKind } from "@/lib/chat";
import { cancelAssistantTurn, startAssistantTurn } from "@/lib/assistant-turn";
import { highlightTodoIds } from "@/lib/highlight-todos";
import {
    parseArchived,
    parseDatePreset,
    parseISODateParam,
    parseSearch,
    parseTodoStatus,
    stripDatesUnlessCustom,
    DatePreset,
    TodoStatus,
    type TodosSearchParams,
} from "@/lib/todos-filters";
import { Density, ListSort, TodoView, parseDensity, parseListSort, parseTodoView } from "@/lib/todos-view";
import { useAssistantStore, type AssistantMessage } from "@/stores/assistant-store";
import { useTodosUiStore } from "@/stores/todos-ui-store";

const SUGGESTIONS = ["add tomorrow to clean up my room", "what are my today tasks?"];

function isTodoViewValue(value: unknown): value is TodoView {
    return (Object.values(TodoView) as unknown[]).includes(value);
}

function isTodoStatusValue(value: unknown): value is TodoStatus {
    return (Object.values(TodoStatus) as unknown[]).includes(value);
}

function isDatePresetValue(value: unknown): value is DatePreset {
    return (Object.values(DatePreset) as unknown[]).includes(value);
}

/** Render `#123` mentions as pills that flash + scroll to the row. */
function AssistantText({ text, onPickId }: { text: string; onPickId: (id: number) => void }) {
    const parts = text.split(/(#\d+)/g);
    return (
        <span className="whitespace-pre-wrap">
            {parts.map((part, i) => {
                const match = /^#(\d+)$/.exec(part);
                if (!match) return <span key={i}>{part}</span>;
                const id = Number(match[1]);
                return (
                    <button
                        key={i}
                        type="button"
                        onClick={() => onPickId(id)}
                        className="rounded-full border border-sky-500/40 bg-sky-500/10 px-1.5 py-px text-xs font-medium text-sky-600 dark:text-sky-400"
                    >
                        #{id}
                    </button>
                );
            })}
        </span>
    );
}

function AssistantBubble({
    message,
    onSend,
    isLatest,
}: {
    message: AssistantMessage;
    onSend: (text: string) => void;
    isLatest: boolean;
}) {
    return (
        <div className="max-w-[92%] self-start text-sm text-muted-foreground">
            {message.text && <AssistantText text={message.text} onPickId={(id) => highlightTodoIds([id])} />}
            {message.widgets.map((widget, i) => {
                switch (widget.kind) {
                    case "todo_list":
                        return <TodoListWidget key={i} widget={widget} />;
                }
            })}
            {isLatest &&
                message.clarification === undefined &&
                (message.suggestions.length > 0 || message.widgets.length > 0) && (
                    <FollowUpChips suggestions={message.suggestions} onSend={onSend} />
                )}
            {message.toolCalls.length > 0 && (
                <details className="mt-1.5 text-xs">
                    <summary className="cursor-pointer text-muted-foreground/70">
                        Thought · {message.toolCalls.length} tool call{message.toolCalls.length === 1 ? "" : "s"}
                    </summary>
                    <ul className="mt-1 flex flex-col gap-1">
                        {message.toolCalls.map((call, i) => (
                            <li key={i} className="rounded-md bg-muted px-2 py-1 font-mono text-[11px]">
                                {call.tool}
                                {call.output === undefined ? " …" : ""}
                            </li>
                        ))}
                    </ul>
                </details>
            )}
            {message.uiNotices.map((notice, i) => (
                <p key={i} className="mt-1 text-xs text-sky-600 dark:text-sky-400">
                    ◉ {notice.summary}
                </p>
            ))}
            {message.clarification && (
                <div className="mt-2 rounded-lg border border-border bg-card p-2.5">
                    <p className="text-[13px] font-medium text-foreground">{message.clarification.question}</p>
                    <div className="mt-1.5 flex flex-col gap-1">
                        {message.clarification.options.map((option, i) => (
                            <button
                                key={option}
                                type="button"
                                onClick={() => onSend(option)}
                                className="rounded-md border border-border px-2 py-1 text-left text-xs hover:border-sky-500 hover:text-sky-600"
                            >
                                <span className="mr-1.5 font-mono text-muted-foreground">{i + 1}</span>
                                {option}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

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
                const current = parseSearch((searchRef.current ?? {}) as Record<string, unknown>);
                const next: TodosSearchParams = { ...current };
                let changed = false;
                if (args["status"] !== undefined) {
                    if (!isTodoStatusValue(args["status"])) throw new Error(`bad status ${String(args["status"])}`);
                    next.status = parseTodoStatus(args["status"]);
                    changed = true;
                }
                if (args["date_preset"] !== undefined) {
                    if (!isDatePresetValue(args["date_preset"]))
                        throw new Error(`bad date_preset ${String(args["date_preset"])}`);
                    next.date_preset = parseDatePreset(args["date_preset"]);
                    changed = true;
                }
                if (args["start_date"] !== undefined) {
                    next.start_date = parseISODateParam(args["start_date"]);
                    changed = true;
                }
                if (args["end_date"] !== undefined) {
                    next.end_date = parseISODateParam(args["end_date"]);
                    changed = true;
                }
                if (args["archived"] !== undefined) {
                    next.archived = parseArchived(args["archived"]);
                    changed = true;
                }
                if (!changed) throw new Error("empty filter change");
                void navigate({ to: "/todos", search: stripDatesUnlessCustom(next) });
                return `Filter → ${next.date_preset} · ${next.status}${next.archived ? " · archived" : ""}`;
            }
            case UiActionKind.SetView: {
                const ui = useTodosUiStore.getState();
                const applied: string[] = [];
                if (args["view"] !== undefined) {
                    if (!isTodoViewValue(args["view"])) throw new Error(`bad view ${String(args["view"])}`);
                    ui.setView(parseTodoView(args["view"]));
                    applied.push(String(args["view"]).replaceAll("_", " "));
                }
                if (args["sort"] !== undefined) {
                    const sort = parseListSort(args["sort"]);
                    if (!sort) throw new Error(`bad sort ${String(args["sort"])}`);
                    ui.setListSort(sort);
                    applied.push(sort === ListSort.Asc ? "oldest first" : "newest first");
                }
                if (args["density"] !== undefined) {
                    const density = parseDensity(args["density"]);
                    if (!density) throw new Error(`bad density ${String(args["density"])}`);
                    ui.setDensity(density);
                    applied.push(density === Density.Compact ? "compact" : "comfortable");
                }
                if (applied.length === 0) throw new Error("empty view change");
                return `View → ${applied.join(" · ")}`;
            }
            case UiActionKind.Highlight: {
                const raw = args["ids"];
                const ids = (Array.isArray(raw) ? raw : [])
                    .map((v) => (typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v))
                    .filter((v): v is number => typeof v === "number" && Number.isInteger(v))
                    .slice(0, 20);
                if (ids.length === 0) throw new Error("no valid todo ids");
                highlightTodoIds(ids);
                return `Highlighted ${ids.map((id) => `#${id}`).join(", ")}`;
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
                    <span className="size-2 rounded-full bg-sky-500" />
                    Assistant
                </p>
                <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Close assistant">
                    <X />
                </Button>
            </div>
            <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
                {messages.map((msg, i) =>
                    msg.role === "user" ? (
                        <div
                            key={msg.id}
                            className="max-w-[88%] self-end rounded-xl rounded-br-sm border border-border/60 bg-muted px-3 py-2 text-sm"
                        >
                            {msg.text}
                        </div>
                    ) : (
                        <AssistantBubble
                            key={msg.id}
                            message={msg}
                            onSend={send}
                            isLatest={i === messages.length - 1}
                        />
                    ),
                )}
                {busy && <p className="self-start text-xs text-muted-foreground">{status}</p>}
            </div>
            {!busy && messages.length <= 2 && (
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
            )}
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

export function AskAssistantButton() {
    const open = useTodosUiStore((s) => s.assistantOpen);
    const setOpen = useTodosUiStore((s) => s.setAssistantOpen);
    function onClick() {
        // Never collapses: when already open, focus the input instead.
        if (open) {
            document.getElementById("assistant-input")?.focus();
            return;
        }
        setOpen(true);
    }
    return (
        <Button size="sm" variant={open ? "secondary" : "default"} onClick={onClick}>
            <Sparkles />
            Ask assistant
        </Button>
    );
}
