/* @jsxImportSource @opentui/react */
import { useRef } from "react";
import { MouseButton, type MouseEvent } from "@opentui/core";
import { useTheme } from "@/hooks/use-theme";

export interface ThinkingBlockProps {
    content: string;
    streaming?: boolean;
    /** Controlled collapse — the parent owns the toggle so one keypress
     * flips exactly one block. Defaults to collapsed when finished. */
    collapsed?: boolean;
    label?: string;
    tokenCount?: number;
    duration?: number;
    /** Click handler for the header line. When set, a left-click (press and
     * release on the same cell, so drag-to-copy is unaffected) calls it. */
    onToggle?: () => void;
}

export const ThinkingBlock = ({
    content,
    streaming = false,
    collapsed: collapsedProp,
    label = "Reasoning",
    tokenCount,
    duration,
    onToggle,
}: ThinkingBlockProps) => {
    const theme = useTheme();
    const collapsed = collapsedProp ?? (!streaming && true);
    // Press position: only a release on the same cell counts as a click,
    // so starting a drag-selection on the header never toggles the block.
    const downPos = useRef<{ x: number; y: number } | null>(null);

    const tokenStr = tokenCount === undefined ? null : `${tokenCount.toLocaleString()} tokens`;
    const durationStr = duration === undefined ? null : `${(duration / 1000).toFixed(1)}s`;

    const headerParts = [streaming ? "Thinking..." : label, tokenStr, durationStr].filter(Boolean);

    const headerText = headerParts.join(" · ");

    return (
        <box
            flexDirection="column"
            borderStyle="single"
            borderColor={theme.colors.border}
            paddingLeft={1}
            paddingRight={1}
        >
            <box
                gap={1}
                onMouseDown={
                    onToggle
                        ? (e: MouseEvent) => {
                              if (e.button === MouseButton.LEFT) downPos.current = { x: e.x, y: e.y };
                          }
                        : undefined
                }
                onMouseUp={
                    onToggle
                        ? (e: MouseEvent) => {
                              const down = downPos.current;
                              downPos.current = null;
                              if (e.button !== MouseButton.LEFT || !down || down.x !== e.x || down.y !== e.y) return;
                              onToggle();
                          }
                        : undefined
                }
            >
                <text fg={theme.colors.mutedForeground}>{collapsed ? "▶" : "▼"}</text>
                <text fg={streaming ? theme.colors.primary : theme.colors.mutedForeground}>{headerText}</text>
            </box>

            {!collapsed && (
                <box flexDirection="column" paddingTop={1}>
                    <text fg={theme.colors.mutedForeground}>{content}</text>
                </box>
            )}
        </box>
    );
};
