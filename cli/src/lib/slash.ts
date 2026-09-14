/** Pure slash-command parsing. Execution lives in hooks/use-slash.ts. */

export interface SlashInvocation {
    name: string;
    arg: string;
}

export function parseSlash(raw: string): SlashInvocation | null {
    if (!raw.startsWith("/")) return null;
    const [cmd, ...rest] = raw.slice(1).split(/\s+/);
    return { name: (cmd ?? "").toLowerCase(), arg: rest.join(" ").trim() };
}
