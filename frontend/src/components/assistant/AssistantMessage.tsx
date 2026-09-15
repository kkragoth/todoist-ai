import { AssistantBubble } from "@/components/assistant/AssistantBubble";
import { UserBubble } from "@/components/assistant/UserBubble";
import { MessageRole, type AssistantMessage as AssistantMessageData } from "@/stores/assistant-store";

export function AssistantMessage({ message, isLatest }: { message: AssistantMessageData; isLatest: boolean }) {
    if (message.role === MessageRole.User) {
        return <UserBubble text={message.text} />;
    }
    return <AssistantBubble message={message} isLatest={isLatest} />;
}
