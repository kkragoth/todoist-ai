import type { ToolStep } from "@/types.js";

/** Plain-text helpers shared by the transcript components and App. */

export function oneLine(text: string, max = 160): string {
    return text.replace(/\s+/g, " ").trim().slice(0, max);
}

export function toolSummary(tools: ToolStep[]): string {
    if (tools.length === 0) return "Answered directly, no tools used.";
    return tools
        .map((t) => {
            const ms = t.elapsedMs !== undefined ? ` (${(t.elapsedMs / 1000).toFixed(1)}s)` : "";
            const out = t.output !== undefined ? ` → ${oneLine(t.output, 120)}` : " …";
            return `• ${t.tool} ${oneLine(JSON.stringify(t.args), 120)}${out}${ms}`;
        })
        .join("\n");
}

/** Runtime passes the input string; the prop type also merges a DOM
 * SubmitEvent arm that never fires — coerce defensively. */
export function submittedText(value: unknown): string {
    return typeof value === "string" ? value : "";
}

export function isThreadId(text: string): boolean {
    return /^\d+$/.test(text);
}
