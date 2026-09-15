// Follow-up chips after an assistant turn. LLM-proposed suggestions
// (`suggest_followups` tool -> `ui_suggestions` event) win; the static
// listing set is the fallback for turns where the model offered none.
// Chips send as normal user messages (not direct actions) so server
// history stays coherent and the model narrates the result.

import { Chips } from "@/components/assistant/Chips";
import { useAssistantStore } from "@/stores/assistant-store";

const FALLBACK_CHIPS = ["Show only open", "Show done", "Group by day", "Highlight these"];

export function FollowUpChips({ suggestions, onSend }: { suggestions: string[]; onSend: (text: string) => void }) {
    const busy = useAssistantStore((s) => s.busy);
    const chips = suggestions.length > 0 ? [...new Set(suggestions)] : FALLBACK_CHIPS;
    if (busy || chips.length === 0) return null;
    return <Chips labels={chips} onSend={onSend} />;
}
