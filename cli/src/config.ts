import type { CliOptions } from "@/types.js";

function pickFlag(argv: string[], name: string): string | undefined {
    const ix = argv.indexOf(name);
    if (ix >= 0 && ix + 1 < argv.length) return argv[ix + 1];
    const prefixed = argv.find((a) => a.startsWith(name + "="));
    if (prefixed) return prefixed.slice(name.length + 1);
    return undefined;
}

function hasFlag(argv: string[], ...names: string[]): boolean {
    return names.some((n) => argv.includes(n));
}

export function parseArgs(argv: string[]): CliOptions & { help: boolean } {
    const apiUrl = pickFlag(argv, "--api-url") ?? process.env["TODO_API_URL"] ?? "http://localhost:8000";
    const threadId = pickFlag(argv, "--thread") ?? process.env["TODO_THREAD"] ?? "";
    const provider = pickFlag(argv, "--provider") ?? process.env["TODO_PROVIDER"] ?? undefined;
    const model = pickFlag(argv, "--model") ?? process.env["TODO_MODEL"] ?? undefined;
    return {
        apiUrl: apiUrl.replace(/\/$/, ""),
        threadId,
        provider: provider || undefined,
        model: model || undefined,
        help: hasFlag(argv, "--help", "-h"),
    };
}

export const HELP_TEXT = `todoist-ai chat CLI (OpenTUI)

Usage: todoist-ai [--api-url URL] [--thread ID] [--provider P] [--model M]

Env: TODO_API_URL, TODO_THREAD, TODO_PROVIDER, TODO_MODEL

Slash commands (in-app):
  /help              show commands
  /clear             delete server history for this thread
  /thread [id]       show current or switch numeric thread
  /threads           list your threads
  /provider [name]   show or set provider (ollama|llamacpp|openrouter)
  /model [name]      show or set model
  /logout            drop saved token
  /quit              exit

Threads are numeric server-side; the CLI learns the id from the
X-Chat-Thread-Id response header. Omit --thread to use most recent.

Keys: enter send (queues while busy) · esc cancel turn · tab completes /command
  ctrl+t expand/collapse thinking · pgup/pgdn scroll · drag text = copy
`;
