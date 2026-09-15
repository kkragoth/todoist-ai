import { Chip } from "@/components/assistant/Chip";

export function Chips({ labels, onSend }: { labels: string[]; onSend: (text: string) => void }) {
    return (
        <div className="mt-1.5 flex flex-wrap gap-2">
            {labels.map((label) => (
                <Chip key={label} label={label} onSelect={onSend} />
            ))}
        </div>
    );
}
