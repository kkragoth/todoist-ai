export interface CliOptions {
  apiUrl: string;
  threadId: string;
  provider?: string;
  model?: string;
}

export type ChatEvent =
  | { type: "token"; content: string }
  | { type: "tool_call"; tool: string; args: Record<string, unknown> }
  | { type: "tool_result"; tool: string; output: string }
  | { type: "done" }
  | { type: "error"; message: string };

export interface ToolStep {
  tool: string;
  args: Record<string, unknown>;
  output?: string;
  elapsedMs?: number;
  startedAt: number;
}

export type TurnPhase = "working" | "done" | "error" | "cancelled";

export interface Turn {
  id: number;
  userText: string;
  answer: string;
  phase: TurnPhase;
  tools: ToolStep[];
  /** Thinking detail lines visible (auto-on while working, auto-off when done). */
  expanded: boolean;
  startedAt: number;
  endedAt?: number;
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
  { name: "/provider", usage: "/provider [name]", desc: "show or set provider" },
  { name: "/model", usage: "/model [name]", desc: "show or set model" },
  { name: "/logout", usage: "/logout", desc: "drop saved token" },
  { name: "/quit", usage: "/quit", desc: "exit" },
];
