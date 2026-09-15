import { Chip } from "@/components/assistant/Chip";
import { useAssistantSend } from "@/lib/assistant-send";

export function Chips({ labels }: { labels: string[] }) {
    const send = useAssistantSend();
    return (
        <div className="mt-1.5 flex flex-wrap gap-2">
            {labels.map((label) => (
                <Chip key={label} label={label} onSelect={send} />
            ))}
        </div>
    );
}
