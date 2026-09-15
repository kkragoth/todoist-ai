import type { AssistantUiNotice } from "@/stores/assistant-store";

export function UiNotice({ notice }: { notice: AssistantUiNotice }) {
    return <p className="mt-1 text-xs text-sky-600 dark:text-assistant-blue">◉ {notice.summary}</p>;
}
