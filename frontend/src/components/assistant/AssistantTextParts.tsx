import { AssistantTextPart } from "@/components/assistant/AssistantTextPart";
import { highlightTodoIds } from "@/lib/highlight-todos";

/** Render `#123` mentions as pills that flash + scroll to the row. */
export function AssistantTextParts({ text }: { text: string }) {
    const parts = text.split(/(#\d+)/g);

    function handlePickId(id: number) {
        highlightTodoIds([id]);
    }

    return (
        <span className="whitespace-pre-wrap">
            {parts.map((part, i) => (
                <AssistantTextPart key={i} part={part} onPickId={handlePickId} />
            ))}
        </span>
    );
}
