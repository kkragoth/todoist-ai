/* Temporary integration probe: real ThinkingBlock + real chat store.
 * Assert header click toggles, drag/right-click do not. */
import { jsx as _jsx, jsxs as _jsxs } from "@opentui/react/jsx-runtime";
import { createTestRenderer, MouseButtons } from "@opentui/core/testing";
import { createRoot } from "@opentui/react";
import { ThinkingBlock } from "@/components/ui/thinking-block.js";
import { useChatStore } from "@/stores/chat-store.js";
import { TurnPhase } from "@/types.js";

function expanded(): boolean | undefined {
    const item = useChatStore.getState().feed[0];
    return item && item.kind === "turn" ? item.turn.expanded : undefined;
}

async function main(): Promise<void> {
    useChatStore.getState().pushTurn({
        id: 7,
        userText: "hi",
        answer: "yo",
        phase: TurnPhase.Done,
        tools: [{ tool: "x", args: {}, startedAt: 0 }],
        expanded: false,
        startedAt: 0,
        endedAt: 1,
    });

    const setup = await createTestRenderer({ width: 40, height: 10, useMouse: true });
    const root = createRoot(setup.renderer);
    const raw: string[] = [];
    root.render(
        _jsxs("box", {
            flexDirection: "column",
            children: [
                _jsx(ThinkingBlock, {
                    content: "abc",
                    collapsed: true,
                    label: "Thought",
                    duration: 1000,
                    onToggle: () => {
                        raw.push("TOGGLE");
                        useChatStore.getState().toggleTurnExpanded(7);
                    },
                }),
                _jsx("box", {
                    onMouseDown: () => {
                        raw.push("probe-down");
                    },
                    onMouseUp: () => {
                        raw.push("probe-up");
                    },
                    children: _jsx("text", { children: "probe" }),
                }),
            ],
        }),
    );
    await setup.flush();

    const results: string[] = [`start:${expanded()}`];
    async function step(name: string, fn: () => Promise<void>): Promise<void> {
        const before = raw.length;
        await fn();
        await setup.flush();
        results.push(`${name}:${expanded()}{${raw.slice(before).join(",")}}`);
    }

    // Settle: pump events until mouse delivery is live (reconciler attaches
    // on* props over several passes in the headless harness).
    for (let i = 0; i < 20 && !raw.includes("probe-down"); i++) {
        await setup.mockMouse.pressDown(1, 3, MouseButtons.LEFT);
        await setup.mockMouse.release(1, 3, MouseButtons.LEFT);
        await setup.flush();
    }
    results.push(`settled:${expanded()}{${raw.join(",")}}`);
    raw.length = 0;

    await step("click", async () => {
        await setup.mockMouse.pressDown(3, 1, MouseButtons.LEFT);
        await setup.mockMouse.release(3, 1, MouseButtons.LEFT);
    });

    await setup.mockMouse.drag(3, 1, 5, 3);
    await setup.flush();
    results.push(`after-drag:${expanded()}`);

    await setup.mockMouse.pressDown(3, 1, MouseButtons.RIGHT);
    await setup.mockMouse.release(3, 1, MouseButtons.RIGHT);
    await setup.flush();
    results.push(`after-rightclick:${expanded()}`);

    await setup.mockMouse.pressDown(3, 1, MouseButtons.LEFT);
    await setup.mockMouse.release(3, 1, MouseButtons.LEFT);
    await setup.flush();
    results.push(`after-click2:${expanded()}`);

    console.log("RESULT:" + JSON.stringify(results));
    const ok =
        results[0] === "start:false" &&
        results[2].startsWith("click:true") &&
        results[3] === "after-drag:true" &&
        results[4] === "after-rightclick:true" &&
        results[5] === "after-click2:false";
    root.unmount();
    process.exit(ok ? 0 : 1);
}

main().catch((e) => {
    console.error("VERIFY-FAIL:", e);
    process.exit(1);
});
