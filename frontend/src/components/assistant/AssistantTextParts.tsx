import { AssistantTextPart } from "@/components/assistant/AssistantTextPart";

/** Render `#123` mentions as pills that flash + scroll to the row. */
export function AssistantTextParts({ text }: { text: string }) {
    const parts = text.split(/(#\d+)/g);

    return (
        <span className="whitespace-pre-wrap">
            {parts.map((part, i) => (
                <AssistantTextPart key={`${part}-${i}`} part={part} />
            ))}
        </span>
    );
}
