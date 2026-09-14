"""Terminal spinner that runs until the LLM finishes responding."""

import asyncio
import time

SPINNER_FRAMES = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"


class TurnSpinner:
    """Owns the terminal line only while the turn is idle.

    Every token or tool announcement should call `clear_for_output`
    first; the spinner reappears (with the current label) if nothing
    prints for ~0.4s — covering initial thinking, gaps between streamed
    tokens, and tool execution.
    """

    def __init__(self, enabled: bool):
        self.enabled = enabled
        self.label = "Thinking…"
        self._last_io = time.monotonic()
        self._stop = asyncio.Event()
        self._task: asyncio.Task | None = None
        self._visible = False

    def start(self) -> None:
        if not self.enabled:
            return
        self._stop.clear()
        self._task = asyncio.create_task(self._run())

    async def _run(self) -> None:
        i = 0
        while not self._stop.is_set():
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=0.08)
                break
            except asyncio.TimeoutError:
                pass
            if time.monotonic() - self._last_io < 0.4:
                continue
            print(f"\r{SPINNER_FRAMES[i % len(SPINNER_FRAMES)]} {self.label}",
                  end="", flush=True)
            self._visible = True
            i += 1

    async def clear_for_output(self) -> None:
        """Call before any real print: hides the spinner, resets idle timer."""
        self._last_io = time.monotonic()
        if self._visible:
            print("\r\x1b[K", end="", flush=True)
            self._visible = False

    def set_label(self, label: str) -> None:
        self.label = label

    async def stop(self) -> None:
        if self._task is None:
            return
        self._stop.set()
        await self._task
        self._task = None
        if self._visible:
            print("\r\x1b[K", end="", flush=True)
            self._visible = False
