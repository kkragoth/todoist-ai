import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTodosUiStore } from "@/stores/todos-ui-store";

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
