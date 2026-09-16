import { AssistantMessage } from "@/components/assistant/AssistantMessage";
import type { AssistantMessage as AssistantMessageData } from "@/stores/assistant-store";

export function AssistantMessages({ messages }: { messages: AssistantMessageData[] }) {
    return (
        <>
            {messages.map((message, i) => (
                <AssistantMessage key={message.id} message={message} isLatest={i === messages.length - 1} />
            ))}
        </>
    );
}
