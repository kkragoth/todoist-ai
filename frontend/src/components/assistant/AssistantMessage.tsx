import { AssistantBubble } from "@/components/assistant/AssistantBubble";
import { UserBubble } from "@/components/assistant/UserBubble";
import { MessageRole, type AssistantMessage as AssistantMessageData } from "@/stores/assistant-store";

export function AssistantMessage({
    message,
    onSend,
    isLatest,
}: {
    message: AssistantMessageData;
    onSend: (text: string) => void;
    isLatest: boolean;
}) {
    if (message.role === MessageRole.User) {
        return <UserBubble text={message.text} />;
    }
    return <AssistantBubble message={message} onSend={onSend} isLatest={isLatest} />;
}
