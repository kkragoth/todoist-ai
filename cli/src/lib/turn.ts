import type { Turn } from "@/types.js";
import { TurnPhase } from "@/types.js";

/** ADT predicates — compare against the TurnPhase enum, never raw strings. */

export function isWorkingTurn(turn: Turn): boolean {
    return turn.phase === TurnPhase.Working;
}

export function isTerminalPhase(phase: TurnPhase): boolean {
    switch (phase) {
        case TurnPhase.Done:
        case TurnPhase.Error:
        case TurnPhase.Cancelled:
            return true;
        case TurnPhase.Working:
            return false;
    }
}

export function turnPhaseLabel(turn: Turn): string {
    switch (turn.phase) {
        case TurnPhase.Done:
            return `Thought · ${turn.tools.length} tool call${turn.tools.length === 1 ? "" : "s"}`;
        case TurnPhase.Cancelled:
            return "Cancelled";
        case TurnPhase.Error:
            return "Failed";
        case TurnPhase.Working:
            return "Thinking";
    }
}

/** Factory + immutable transitions so call sites never build Turn literals. */

let nextTurnId = 1;

export function createTurn(userText: string): Turn {
    return {
        id: nextTurnId++,
        userText,
        answer: "",
        phase: TurnPhase.Working,
        tools: [],
        expanded: true,
        startedAt: Date.now(),
    };
}

export function nextSystemId(): number {
    return nextTurnId++;
}

export function nextQueueId(): number {
    return nextTurnId++;
}

export function completeTurnIfWorking(turn: Turn): Turn {
    if (!isWorkingTurn(turn)) return turn;
    return { ...turn, phase: TurnPhase.Done, endedAt: Date.now(), expanded: false };
}

export function failTurn(turn: Turn): Turn {
    return { ...turn, phase: TurnPhase.Error, endedAt: Date.now(), expanded: false };
}

export function cancelTurn(turn: Turn): Turn {
    return { ...turn, phase: TurnPhase.Cancelled, endedAt: Date.now(), expanded: false };
}

export function appendAnswer(turn: Turn, chunk: string): Turn {
    return { ...turn, answer: turn.answer + chunk };
}
