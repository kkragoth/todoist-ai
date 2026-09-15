// Assistant transcript state. Lives in zustand (not drawer useState) so the
// conversation survives the drawer closing — the toggle is on|off, not reset.
// Turn orchestration (SSE loop, abort) lives in `lib/assistant-turn.ts`,
// mirroring `cli/src/lib/chat-turn.ts` over this store.

import { create } from "zustand";
import { CHAT_MAX_SUGGESTIONS, setWidgetTodoCompleted, type AssistantWidget, type UiActionKind } from "@/lib/chat";

export enum MessageRole {
    User = "user",
    Assistant = "assistant",
}

export interface AssistantToolCall {
    tool: string;
    args: Record<string, unknown>;
    output?: string;
}

export interface AssistantClarification {
    question: string;
    options: string[];
}

export interface AssistantUiNotice {
    action: UiActionKind;
    summary: string;
}

export interface AssistantMessage {
    id: number;
    role: MessageRole;
    text: string;
    toolCalls: AssistantToolCall[];
    clarification?: AssistantClarification;
    uiNotices: AssistantUiNotice[];
    widgets: AssistantWidget[];
    suggestions: string[];
}

const THREAD_KEY = "todoist-ai.assistant-thread";

let nextId = 1;

export function nextAssistantId(): number {
    nextId += 1;
    return nextId;
}

function loadThreadId(): string | null {
    try {
        return localStorage.getItem(THREAD_KEY);
    } catch {
        return null;
    }
}

interface AssistantState {
    messages: AssistantMessage[];
    busy: boolean;
    status: string;
    threadId: string | null;
    pushUser: (text: string) => void;
    pushAssistantPlaceholder: () => number;
    appendAssistantText: (id: number, chunk: string) => void;
    addToolCall: (id: number, tool: string, args: Record<string, unknown>) => void;
    setToolResult: (id: number, tool: string, output: string) => void;
    setClarification: (id: number, question: string, options: string[]) => void;
    addUiNotice: (id: number, notice: AssistantUiNotice) => void;
    addWidget: (id: number, widget: AssistantWidget) => void;
    addSuggestions: (id: number, suggestions: string[]) => void;
    setWidgetTodoCompleted: (id: number, completed: boolean) => void;
    setBusy: (busy: boolean) => void;
    setStatus: (status: string) => void;
    setThreadId: (threadId: string) => void;
}

function updateMessage(messages: AssistantMessage[], id: number, fn: (m: AssistantMessage) => AssistantMessage) {
    return messages.map((m) => (m.id === id ? fn(m) : m));
}

export const useAssistantStore = create<AssistantState>()((set) => ({
    messages: [
        {
            id: nextId,
            role: MessageRole.Assistant,
            text: "Ask me to add, reschedule, or find tasks — I'll drive the same filters and list.",
            toolCalls: [],
            uiNotices: [],
            widgets: [],
            suggestions: [],
        },
    ],
    busy: false,
    status: "Ready.",
    threadId: loadThreadId(),
    pushUser: (text) =>
        set((s) => ({
            messages: [
                ...s.messages,
                {
                    id: nextAssistantId(),
                    role: MessageRole.User,
                    text,
                    toolCalls: [],
                    uiNotices: [],
                    widgets: [],
                    suggestions: [],
                },
            ],
        })),
    pushAssistantPlaceholder: () => {
        const id = nextAssistantId();
        set((s) => ({
            messages: [
                ...s.messages,
                {
                    id,
                    role: MessageRole.Assistant,
                    text: "",
                    toolCalls: [],
                    uiNotices: [],
                    widgets: [],
                    suggestions: [],
                },
            ],
        }));
        return id;
    },
    appendAssistantText: (id, chunk) =>
        set((s) => ({ messages: updateMessage(s.messages, id, (m) => ({ ...m, text: m.text + chunk })) })),
    addToolCall: (id, tool, args) =>
        set((s) => ({
            messages: updateMessage(s.messages, id, (m) => ({ ...m, toolCalls: [...m.toolCalls, { tool, args }] })),
        })),
    setToolResult: (id, tool, output) =>
        set((s) => ({
            messages: updateMessage(s.messages, id, (m) => {
                const toolCalls = [...m.toolCalls];
                for (let i = toolCalls.length - 1; i >= 0; i--) {
                    if (toolCalls[i]!.output === undefined) {
                        toolCalls[i] = { ...toolCalls[i]!, tool, output };
                        break;
                    }
                }
                return { ...m, toolCalls };
            }),
        })),
    setClarification: (id, question, options) =>
        set((s) => ({
            messages: updateMessage(s.messages, id, (m) => ({
                ...m,
                clarification: {
                    question,
                    options: options
                        .map((o) => o.trim())
                        .filter((o) => o.length > 0)
                        .slice(0, CHAT_MAX_SUGGESTIONS),
                },
            })),
        })),
    addUiNotice: (id, notice) =>
        set((s) => ({
            messages: updateMessage(s.messages, id, (m) => ({ ...m, uiNotices: [...m.uiNotices, notice] })),
        })),
    addWidget: (id, widget) =>
        set((s) => ({
            messages: updateMessage(s.messages, id, (m) => ({ ...m, widgets: [...m.widgets, widget] })),
        })),
    setWidgetTodoCompleted: (todoId, completed) =>
        set((s) => ({
            messages: s.messages.map((m) => ({
                ...m,
                widgets: m.widgets.map((w) => setWidgetTodoCompleted(w, todoId, completed)),
            })),
        })),
    addSuggestions: (id, suggestions) =>
        set((s) => ({
            messages: updateMessage(s.messages, id, (m) => ({
                ...m,
                suggestions: [...m.suggestions, ...suggestions].slice(0, CHAT_MAX_SUGGESTIONS),
            })),
        })),
    setBusy: (busy) => set({ busy }),
    setStatus: (status) => set({ status }),
    setThreadId: (threadId) => {
        try {
            localStorage.setItem(THREAD_KEY, threadId);
        } catch {
            // private mode etc. — thread just won't persist
        }
        set({ threadId });
    },
}));

/** Resolve a numeric reply ("1".."4") against the newest clarification's
 * options. Anything else passes through — free text answering in the user's
 * own words. Only the newest turn counts, so a stale digit typed much later
 * is never misresolved. */
export function resolveAssistantPick(messages: AssistantMessage[], text: string): string {
    const trimmed = text.trim();
    if (!/^[1-4]$/.test(trimmed)) return text;
    const latest = [...messages].reverse().find((m) => (m.clarification?.options.length ?? 0) > 0);
    if (!latest?.clarification) return text;
    return latest.clarification.options[Number(trimmed) - 1] ?? text;
}
