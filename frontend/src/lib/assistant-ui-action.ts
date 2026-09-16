// Pure `ui_action` application for the web assistant. Extracted from
// `AssistantSidebar` so the drawer stays a shell (draft + JSX) and the
// filter/view/highlight switch is testable without rendering.

import {
    CHAT_HIGHLIGHT_MAX_IDS,
    UiActionKind,
    type HighlightActionArgs,
    type SetFilterActionArgs,
    type SetViewActionArgs,
} from "@/lib/chat";
import { highlightTodoIds } from "@/lib/highlight-todos";
import {
    parseArchived,
    parseDatePresetStrict,
    parseISODateParam,
    parseSearch,
    parseTodoStatusStrict,
    stripDatesUnlessCustom,
    datePresetLabel,
    statusLabel,
    type TodosSearchParams,
} from "@/lib/todos-filters";
import {
    densityLabel,
    parseDensity,
    parseListSort,
    parseTodoViewStrict,
    sortLabel,
    viewLabel,
    type Density,
    type ListSort,
    type TodoView,
} from "@/lib/todos-view";

export interface TodosViewState {
    view: TodoView;
    listSort: ListSort;
    density: Density;
}

export interface UiActionDeps {
    search: Record<string, unknown>;
    ui: TodosViewState & {
        setView: (view: TodoView) => void;
        setListSort: (sort: ListSort) => void;
        setDensity: (density: Density) => void;
    };
    navigate: (to: "/todos", search: TodosSearchParams) => void;
}

export function buildUiState(search: Record<string, unknown>, ui: TodosViewState): Record<string, unknown> {
    const parsed = parseSearch(search);
    return {
        status: parsed.status,
        date_preset: parsed.date_preset,
        ...(parsed.start_date ? { start_date: parsed.start_date } : {}),
        ...(parsed.end_date ? { end_date: parsed.end_date } : {}),
        archived: parsed.archived,
        view: ui.view,
        sort: ui.listSort,
        density: ui.density,
    };
}

export function applyUiAction(action: UiActionKind, args: Record<string, unknown>, deps: UiActionDeps): string {
    switch (action) {
        case UiActionKind.SetFilter: {
            const filterArgs = args as SetFilterActionArgs;
            const current = parseSearch(deps.search);
            const next: TodosSearchParams = { ...current };
            let changed = false;
            if (filterArgs.status !== undefined) {
                const status = parseTodoStatusStrict(filterArgs.status);
                if (!status) throw new Error(`bad status ${String(filterArgs.status)}`);
                next.status = status;
                changed = true;
            }
            if (filterArgs.date_preset !== undefined) {
                const preset = parseDatePresetStrict(filterArgs.date_preset);
                if (!preset) throw new Error(`bad date_preset ${String(filterArgs.date_preset)}`);
                next.date_preset = preset;
                changed = true;
            }
            if (filterArgs.start_date !== undefined) {
                next.start_date = parseISODateParam(filterArgs.start_date);
                changed = true;
            }
            if (filterArgs.end_date !== undefined) {
                next.end_date = parseISODateParam(filterArgs.end_date);
                changed = true;
            }
            if (filterArgs.archived !== undefined) {
                next.archived = parseArchived(filterArgs.archived);
                changed = true;
            }
            if (!changed) throw new Error("empty filter change");
            deps.navigate("/todos", stripDatesUnlessCustom(next));
            return `Filter → ${datePresetLabel(next.date_preset)} · ${statusLabel(next.status)}${next.archived ? " · archived" : ""}`;
        }
        case UiActionKind.SetView: {
            const viewArgs = args as SetViewActionArgs;
            const applied: string[] = [];
            if (viewArgs.view !== undefined) {
                const view = parseTodoViewStrict(viewArgs.view);
                if (!view) throw new Error(`bad view ${String(viewArgs.view)}`);
                deps.ui.setView(view);
                applied.push(viewLabel(view));
            }
            if (viewArgs.sort !== undefined) {
                const sort = parseListSort(viewArgs.sort);
                if (!sort) throw new Error(`bad sort ${String(viewArgs.sort)}`);
                deps.ui.setListSort(sort);
                applied.push(sortLabel(sort));
            }
            if (viewArgs.density !== undefined) {
                const density = parseDensity(viewArgs.density);
                if (!density) throw new Error(`bad density ${String(viewArgs.density)}`);
                deps.ui.setDensity(density);
                applied.push(densityLabel(density));
            }
            if (applied.length === 0) throw new Error("empty view change");
            return `View → ${applied.join(" · ")}`;
        }
        case UiActionKind.Highlight: {
            const raw = (args as HighlightActionArgs).ids;
            const ids = (Array.isArray(raw) ? raw : [])
                .map((v) => (typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v))
                .filter((v): v is number => typeof v === "number" && Number.isInteger(v))
                .slice(0, CHAT_HIGHLIGHT_MAX_IDS);
            if (ids.length === 0) throw new Error("no valid todo ids");
            highlightTodoIds(ids);
            return `Highlighted ${ids.map((id) => `#${id}`).join(", ")}`;
        }
        default: {
            const _exhaustive: never = action;
            void _exhaustive;
            throw new Error(`unknown ui action ${String(action)}`);
        }
    }
}
