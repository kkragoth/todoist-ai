import { StarterSuggestion } from "@/components/assistant/StarterSuggestion";

export function StarterSuggestions({ suggestions, onSend }: { suggestions: string[]; onSend: (text: string) => void }) {
    return (
        <div className="flex flex-col gap-1.5 px-3 pb-2">
            {suggestions.map((suggestion) => (
                <StarterSuggestion key={suggestion} suggestion={suggestion} onSend={onSend} />
            ))}
        </div>
    );
}
