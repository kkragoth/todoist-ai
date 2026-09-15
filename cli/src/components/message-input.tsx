import type { InputRenderable } from "@opentui/core";
import type { RefObject } from "react";
import { submitChatText } from "@/lib/chat-turn.js";
import { submitDirectText } from "@/lib/mcp-direct.js";
import { handleSlashCommand } from "@/lib/slash-commands.js";
import { submittedText } from "@/lib/text.js";
import { useChatStore } from "@/stores/chat-store.js";
import { useComposerStore } from "@/stores/composer-store.js";
import { useSessionUiStore } from "@/stores/session-ui-store.js";
import { useSessionStore } from "@/stores/session-store.js";

/** Message input box + key-hint footer. The input ref is owned by App (the
 * keyboard handler writes completions into it); everything else is stores. */
export function MessageInput({ inputRef }: { inputRef: RefObject<InputRenderable | null> }) {
    const busy = useChatStore((s) => s.busy);
    const queue = useChatStore((s) => s.queue);
    const paletteOpen = useSessionUiStore((s) => s.paletteOpen);
    const setDraft = useComposerStore((s) => s.setDraft);

    function handleSubmit(value: string) {
        const text = value.trim();
        if (inputRef.current) inputRef.current.value = "";
        useComposerStore.getState().clear();
        if (!text || !useSessionStore.getState().token) return;
        if (text.startsWith("/")) {
            void handleSlashCommand(text);
            return;
        }
        // MCP direct mode: plain text is a read-only MCP list (fuzzy query),
        // bypassing the LLM. Writes stay on explicit /add /done commands.
        if (useSessionStore.getState().mcpDirect) {
            void submitDirectText(text);
            return;
        }
        submitChatText(text);
    }

    return (
        <>
            <box
                title={queue.length > 0 ? `Message — ${queue.length} queued` : "Message (/ for commands)"}
                border
                style={{ height: 3 }}
            >
                <input
                    ref={inputRef}
                    placeholder="Ask about todos…"
                    focused={!paletteOpen}
                    onInput={setDraft}
                    onSubmit={(v: unknown) => handleSubmit(submittedText(v))}
                />
            </box>
            <text fg="gray">
                enter send{busy ? " (queues)" : ""} · esc cancel · ctrl+t tools · pgup/pgdn scroll · drag text = copy ·
                /quit exits
            </text>
        </>
    );
}
