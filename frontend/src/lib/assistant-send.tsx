// Send context for the assistant: chips / clarification options submit as
// normal user messages without threading `onSend` through 5 levels of props.
// The provider lives in `AssistantSidebar` (it owns navigate + ui snapshot);
// any nested bubble reads `useAssistantSend()` directly.

import { createContext, useContext } from "react";

export type AssistantSend = (text: string) => void;

const AssistantSendContext = createContext<AssistantSend | null>(null);

export function AssistantSendProvider({ send, children }: { send: AssistantSend; children: React.ReactNode }) {
    return <AssistantSendContext.Provider value={send}>{children}</AssistantSendContext.Provider>;
}

export function useAssistantSend(): AssistantSend {
    const ctx = useContext(AssistantSendContext);
    if (!ctx) throw new Error("useAssistantSend must be used inside <AssistantSendProvider>");
    return ctx;
}
