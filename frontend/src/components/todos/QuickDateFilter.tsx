import { useNavigate, useSearch } from "@tanstack/react-router";
import { SegmentedControl } from "@/components/todos/SegmentedControl";
import {
    DatePreset,
    datePresetLabel,
    parseDatePresetStrict,
    stripDatesUnlessCustom,
    type TodosSearchParams,
} from "@/lib/todos-filters";

const QUICK_PRESETS = [DatePreset.All, DatePreset.Overdue, DatePreset.Today, DatePreset.Tomorrow];

/**
 * List-view-only quick date picker. Rendered inline in the view-controls
 * row (the same slot expand/collapse occupies in grouped views).
 * Grouped views hide this entirely and ignore `date_preset`.
 */
export function QuickDateFilter() {
    const search = useSearch({ from: "/todos" });
    const navigate = useNavigate({ from: "/todos" });

    function updateSearch(patch: Partial<TodosSearchParams>) {
        navigate({ to: "/todos", search: stripDatesUnlessCustom({ ...search, ...patch }) });
    }

    function selectPreset(value: string) {
        const preset = parseDatePresetStrict(value);
        if (preset) updateSearch({ date_preset: preset });
    }

    return (
        <SegmentedControl
            label="Filter by date"
            items={QUICK_PRESETS.map((preset) => ({ value: preset, label: datePresetLabel(preset) }))}
            selected={search.date_preset}
            onSelect={selectPreset}
        />
    );
}
