import { AssistantTextParts } from "@/components/assistant/AssistantTextParts";
import { AssistantWidgets } from "@/components/assistant/AssistantWidgets";
import { ClarificationOptions } from "@/components/assistant/ClarificationOptions";
import { FollowUpChips } from "@/components/assistant/FollowUpChips";
import { ToolCalls } from "@/components/assistant/ToolCalls";
import { UiNotices } from "@/components/assistant/UiNotices";
import type { AssistantMessage } from "@/stores/assistant-store";

export function AssistantBubble({ message, isLatest }: { message: AssistantMessage; isLatest: boolean }) {
    return (
        <div className="max-w-[92%] self-start text-sm text-muted-foreground">
            {message.text && <AssistantTextParts text={message.text} />}
            <AssistantWidgets widgets={message.widgets} />
            {isLatest &&
                message.clarification === undefined &&
                (message.suggestions.length > 0 || message.widgets.length > 0) && (
                    <FollowUpChips suggestions={message.suggestions} />
                )}
            {message.toolCalls.length > 0 && (
                <details className="mt-1.5 text-xs">
                    <summary className="cursor-pointer text-muted-foreground/70">
                        Thought · {message.toolCalls.length} tool call{message.toolCalls.length === 1 ? "" : "s"}
                    </summary>
                    <ToolCalls calls={message.toolCalls} />
                </details>
            )}
            <UiNotices notices={message.uiNotices} />
            {message.clarification && (
                <div className="mt-2 rounded-lg border border-border bg-card p-2.5">
                    <p className="text-[13px] font-medium text-foreground">{message.clarification.question}</p>
                    <ClarificationOptions options={message.clarification.options} />
                </div>
            )}
        </div>
    );
}
