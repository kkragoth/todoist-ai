import { useNavigate, useSearch } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { DatePreset, TodoStatus, datePresetLabel, statusLabel } from "@/lib/todos-filters";

const STATUS_OPTIONS = [TodoStatus.All, TodoStatus.Open, TodoStatus.Done];

const PRESET_OPTIONS = [DatePreset.All, DatePreset.Today, DatePreset.Yesterday, DatePreset.OneWeek, DatePreset.Custom];

export function TodosFilters() {
    const search = useSearch({ from: "/todos" });
    const navigate = useNavigate({ from: "/todos" });

    return (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            {STATUS_OPTIONS.map((option) => (
                <Button
                    key={option}
                    variant={search.status === option ? "default" : "outline"}
                    size="sm"
                    onClick={() => navigate({ to: "/todos", search: { ...search, status: option } })}
                >
                    {statusLabel(option)}
                </Button>
            ))}
            <label className="ml-1 flex items-center gap-1.5 text-muted-foreground">
                <input
                    type="checkbox"
                    checked={search.archived}
                    onChange={(e) => navigate({ to: "/todos", search: { ...search, archived: e.target.checked } })}
                />
                Show archived
            </label>
            {PRESET_OPTIONS.map((preset) => (
                <Button
                    key={preset}
                    variant={search.date_preset === preset ? "default" : "outline"}
                    size="sm"
                    onClick={() =>
                        navigate({
                            to: "/todos",
                            search: {
                                ...search,
                                date_preset: preset,
                                start_date: preset === DatePreset.Custom ? search.start_date : "",
                                end_date: preset === DatePreset.Custom ? search.end_date : "",
                            },
                        })
                    }
                >
                    {datePresetLabel(preset)}
                </Button>
            ))}
            {search.date_preset === DatePreset.Custom && (
                <span className="flex items-center gap-2">
                    <input
                        type="date"
                        aria-label="Start date"
                        className="h-7 rounded-md border border-input bg-background px-2 text-xs outline-none"
                        value={search.start_date}
                        onChange={(e) => navigate({ to: "/todos", search: { ...search, start_date: e.target.value } })}
                    />
                    <span className="text-muted-foreground">→</span>
                    <input
                        type="date"
                        aria-label="End date"
                        className="h-7 rounded-md border border-input bg-background px-2 text-xs outline-none"
                        value={search.end_date}
                        onChange={(e) => navigate({ to: "/todos", search: { ...search, end_date: e.target.value } })}
                    />
                </span>
            )}
        </div>
    );
}
