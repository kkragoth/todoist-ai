import { UiNotice } from "@/components/assistant/UiNotice";
import type { AssistantUiNotice } from "@/stores/assistant-store";

export function UiNotices({ notices }: { notices: AssistantUiNotice[] }) {
    return (
        <>
            {notices.map((notice, i) => (
                <UiNotice key={`${notice.action}-${notice.summary}-${i}`} notice={notice} />
            ))}
        </>
    );
}
