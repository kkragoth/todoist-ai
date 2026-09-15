import { AssistantMessage } from "@/components/assistant/AssistantMessage";
import type { AssistantMessage as AssistantMessageData } from "@/stores/assistant-store";

export function AssistantMessages({
    messages,
    onSend,
}: {
    messages: AssistantMessageData[];
    onSend: (text: string) => void;
}) {
    return (
        <>
            {messages.map((message, i) => (
                <AssistantMessage
                    key={message.id}
                    message={message}
                    onSend={onSend}
                    isLatest={i === messages.length - 1}
                />
            ))}
        </>
    );
}
