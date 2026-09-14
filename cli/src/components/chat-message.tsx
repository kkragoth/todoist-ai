/* Chat transcript rows composed from termcn OpenTUI components:
 * ChatMessage (user / assistant / system bubbles), StreamingText
 * (assistant answer), ThinkingBlock (per-turn tool summary) and
 * ToolCall (one row per tool invocation). */
import type { FeedItem, ToolStep, Turn } from "../types.js";
import { ChatMessage } from "./ui/chat-message.js";
import { StreamingText } from "./ui/streaming-text.js";
import { ThinkingBlock } from "./ui/thinking-block.js";
import { ToolCall } from "./ui/tool-call.js";
import type { ToolCallStatus } from "./ui/tool-call.js";

function oneLine(text: string, max = 160): string {
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

function toolSummary(tools: ToolStep[]): string {
  if (tools.length === 0) return "Answered directly, no tools used.";
  return tools
    .map((t) => {
      const ms = t.elapsedMs !== undefined ? ` (${(t.elapsedMs / 1000).toFixed(1)}s)` : "";
      const out = t.output !== undefined ? ` → ${oneLine(t.output, 120)}` : " …";
      return `• ${t.tool} ${oneLine(JSON.stringify(t.args), 120)}${out}${ms}`;
    })
    .join("\n");
}

function stepStatus(step: ToolStep, working: boolean): ToolCallStatus {
  if (step.output !== undefined) return "success";
  return working ? "running" : "pending";
}

export function TurnView({ turn, now }: { turn: Turn; now: number }) {
  const working = turn.phase === "working";
  const showTools = working || turn.expanded;
  const duration =
    (turn.endedAt ?? now) - turn.startedAt;
  const label =
    turn.phase === "done"
      ? `Thought · ${turn.tools.length} tool call${turn.tools.length === 1 ? "" : "s"}`
      : turn.phase === "cancelled"
        ? "Cancelled"
        : turn.phase === "error"
          ? "Failed"
          : "Thinking";

  return (
    <box flexDirection="column">
      <ChatMessage sender="user" name="You" selectable>
        {turn.userText}
      </ChatMessage>

      <ThinkingBlock
        streaming={working}
        collapsed={working ? false : !turn.expanded}
        label={label}
        duration={duration}
        content={working && turn.tools.length === 0 ? "Contacting model…" : toolSummary(turn.tools)}
      />

      {showTools
        ? turn.tools.map((t: ToolStep, i: number) => (
            <box key={i} style={{ paddingLeft: 1 }}>
              <ToolCall
                name={t.tool}
                args={t.args}
                status={stepStatus(t, working)}
                result={t.output}
                duration={t.elapsedMs}
                collapsible={false}
              />
            </box>
          ))
        : null}

      <ChatMessage sender="assistant" name="Assistant" streaming={working} selectable>
        <>
          <StreamingText text={turn.answer} selectable cursor={false} />
          {working && <text fg="#666">▍</text>}
        </>
      </ChatMessage>
    </box>
  );
}

export function FeedView({ item, now }: { item: FeedItem; now: number }) {
  if (item.kind === "turn") {
    return <TurnView turn={item.turn} now={now} />;
  }
  if (item.kind === "queued") {
    return (
      <ChatMessage sender="user" name="You (queued)" selectable>
        {item.text}
      </ChatMessage>
    );
  }
  return <ChatMessage sender="system">{item.text}</ChatMessage>;
}
