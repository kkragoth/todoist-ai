// Follow-up chips after an assistant turn. LLM-proposed suggestions
// (`suggest_followups` tool -> `ui_suggestions` event) win; the static
// listing set is the fallback for turns where the model offered none.
// Chips send as normal user messages (not direct actions) so server
// history stays coherent and the model narrates the result.

import { useAssistantStore } from "@/stores/assistant-store";

const FALLBACK_CHIPS = ["Show only open", "Show done", "Group by day", "Highlight these"];

export function FollowUpChips({ suggestions, onSend }: { suggestions: string[]; onSend: (text: string) => void }) {
    const busy = useAssistantStore((s) => s.busy);
    const chips = suggestions.length > 0 ? suggestions : FALLBACK_CHIPS;
    return (
        <>
            {!busy && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                    {chips.map((chip) => (
                        <button
                            key={chip}
                            type="button"
                            onClick={() => onSend(chip)}
                            className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground hover:border-sky-500 hover:text-sky-600"
                        >
                            {chip}
                        </button>
                    ))}
                </div>
            )}
        </>
    );
}
