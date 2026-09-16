export interface CliOptions {
    apiUrl: string;
    threadId: string;
    provider?: string;
    model?: string;
    mcpDirect: boolean;
    /** Show username/password tabs next to browser OAuth (default: OAuth only). */
    allowPasswordLogin: boolean;
}

export type ChatEvent =
    | { type: "token"; content: string }
    | { type: "tool_call"; tool: string; args: Record<string, unknown> }
    | { type: "tool_result"; tool: string; output: string }
    | { type: "ask_user"; question: string; options?: string[] }
    | { type: "done" }
    | { type: "error"; message: string };

export interface ToolStep {
    tool: string;
    args: Record<string, unknown>;
    output?: string;
    elapsedMs?: number;
    startedAt: number;
}

export enum TurnPhase {
    Working = "working",
    Done = "done",
    Error = "error",
    Cancelled = "cancelled",
}

export interface Turn {
    id: number;
    userText: string;
    answer: string;
    phase: TurnPhase;
    tools: ToolStep[];
    /** Clarifying question the model asked instead of acting; reply continues the thread. */
    clarification?: Clarification;
    /** Thinking detail lines visible (auto-on while working, auto-off when done). */
    expanded: boolean;
    startedAt: number;
    endedAt?: number;
}

export interface Clarification {
    question: string;
    options: string[];
}

export type FeedItem =
    | { kind: "system"; id: number; text: string }
    | { kind: "turn"; turn: Turn }
    | { kind: "queued"; id: number; text: string };

export interface SlashCommand {
    name: string;
    usage: string;
    desc: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
    { name: "/help", usage: "/help", desc: "show commands" },
    { name: "/clear", usage: "/clear", desc: "delete server history for this thread" },
    { name: "/thread", usage: "/thread <id>", desc: "show or switch numeric thread" },
    { name: "/threads", usage: "/threads", desc: "list your threads" },
    { name: "/sessions", usage: "/sessions", desc: "search, resume, or start sessions" },
    { name: "/provider", usage: "/provider [name]", desc: "show or set provider" },
    { name: "/model", usage: "/model [name]", desc: "show or set model" },
    { name: "/logout", usage: "/logout", desc: "drop saved token" },
    { name: "/quit", usage: "/quit", desc: "exit" },
    { name: "/mcp", usage: "/mcp [on|off|status]", desc: "MCP direct mode (bypass LLM)" },
    { name: "/tools", usage: "/tools", desc: "list MCP tools" },
    { name: "/resources", usage: "/resources", desc: "list MCP resources" },
    { name: "/prompts", usage: "/prompts", desc: "list MCP prompts" },
    { name: "/list", usage: "/list [query]", desc: "list todos via MCP" },
    { name: "/read", usage: "/read <id>", desc: "read one todo resource" },
    { name: "/add", usage: "/add <task>", desc: "add todo via MCP" },
    { name: "/done", usage: "/done <id>", desc: "mark todo done via MCP" },
    { name: "/reopen", usage: "/reopen <id>", desc: "mark todo open via MCP" },
    { name: "/archive", usage: "/archive <id>", desc: "archive todo via MCP" },
    { name: "/delete", usage: "/delete <id>", desc: "permanently delete via MCP" },
];

export enum AuthMode {
    OAuth = "oauth",
    Login = "login",
    Register = "register",
}

export enum AuthFocus {
    Tabs = "tabs",
    User = "user",
    Pass = "pass",
}

export function nextAuthFocus(focus: AuthFocus): AuthFocus {
    switch (focus) {
        case AuthFocus.Tabs:
            return AuthFocus.User;
        case AuthFocus.User:
            return AuthFocus.Pass;
        case AuthFocus.Pass:
            return AuthFocus.Tabs;
    }
}

export function prevAuthFocus(focus: AuthFocus): AuthFocus {
    switch (focus) {
        case AuthFocus.Tabs:
            return AuthFocus.Pass;
        case AuthFocus.User:
            return AuthFocus.Tabs;
        case AuthFocus.Pass:
            return AuthFocus.User;
    }
}
