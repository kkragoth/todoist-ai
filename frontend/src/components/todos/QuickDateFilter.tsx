import { useSearch } from "@tanstack/react-router";
import { SegmentedControl } from "@/components/todos/SegmentedControl";
import { useUpdateTodosSearch } from "@/hooks/useTodosSearch";
import { DatePreset, datePresetLabel, parseDatePresetStrict } from "@/lib/todos-filters";

const QUICK_PRESETS = [DatePreset.All, DatePreset.Overdue, DatePreset.Today, DatePreset.Tomorrow];

/**
 * List-view-only quick date picker. Rendered inline in the view-controls
 * row (the same slot expand/collapse occupies in grouped views).
 * Grouped views hide this entirely and ignore `date_preset`.
 */
export function QuickDateFilter() {
    const search = useSearch({ from: "/todos" });
    const updateSearch = useUpdateTodosSearch();

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
