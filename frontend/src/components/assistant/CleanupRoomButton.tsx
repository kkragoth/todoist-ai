import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Archive } from "lucide-react";
import { TodoView, isListView, viewLabel } from "@/lib/todos-view";
import { archiveCompletedTodos } from "@/lib/cleanup-room";
import { useTodosUiStore } from "@/stores/todos-ui-store";

/**
 * "Clean up my room" quick action for the assistant sidebar: archives all
 * completed todos, then flips the layout to the opposite view
 * (List <-> Grouped). View state comes from the todos UI store; no props.
 */
export function CleanupRoomButton() {
    const view = useTodosUiStore((s) => s.view);
    const setView = useTodosUiStore((s) => s.setView);
    const queryClient = useQueryClient();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const nextView = isListView(view) ? TodoView.Grouped : TodoView.List;

    async function onCleanup() {
        if (pending) return;
        setPending(true);
        setError(null);
        try {
            await archiveCompletedTodos();
            setView(nextView);
            await queryClient.invalidateQueries({ queryKey: ["todos"] });
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not clean up.");
        } finally {
            setPending(false);
        }
    }

    return (
        <div className="flex flex-col gap-1 px-3 pb-2">
            <button
                type="button"
                onClick={onCleanup}
                disabled={pending}
                className="rounded-lg border border-dashed border-border px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:border-sky-500 hover:text-sky-600 disabled:opacity-50 dark:hover:border-assistant-blue dark:hover:text-assistant-blue"
            >
                <span className="flex items-center gap-1.5">
                    <Archive className="size-3.5 shrink-0" />
                    {pending ? "Cleaning up…" : `Clean up my room: archive done + switch to ${viewLabel(nextView)}`}
                </span>
            </button>
            {error && <p className="px-0.5 text-[11px] text-destructive">{error}</p>}
        </div>
    );
}
