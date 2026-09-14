import { useNavigate, useSearch } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { DatePreset, TodoStatus, datePresetLabel, statusLabel } from "@/lib/todos-filters";
import { useTodosUiStore } from "@/stores/todos-ui-store";

const STATUS_OPTIONS = [TodoStatus.All, TodoStatus.Open, TodoStatus.Done];

const PRESET_OPTIONS = [
    DatePreset.All,
    DatePreset.Overdue,
    DatePreset.Today,
    DatePreset.Tomorrow,
    DatePreset.Week,
    DatePreset.Later,
    DatePreset.Custom,
];

export function TodosFilters() {
    const search = useSearch({ from: "/todos" });
    const navigate = useNavigate({ from: "/todos" });
    const searchText = useTodosUiStore((s) => s.searchText);
    const setSearchText = useTodosUiStore((s) => s.setSearchText);

    return (
        <div className="mt-4 flex flex-col gap-2.5">
            <label className="flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm shadow-sm focus-within:ring-2 focus-within:ring-ring/50">
                <Search className="size-3.5 shrink-0 text-muted-foreground" />
                <input
                    className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground/60"
                    placeholder="Fuzzy search tasks…"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                />
                {searchText.trim() && (
                    <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setSearchText("")}
                    >
                        Clear
                    </button>
                )}
            </label>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <span className="flex items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground/70">Status</span>
                    {STATUS_OPTIONS.map((option) => (
                        <Button
                            key={option}
                            variant={search.status === option ? "default" : "outline"}
                            size="sm"
                            className={cn(search.status !== option && "rounded-full bg-card")}
                            onClick={() => navigate({ to: "/todos", search: { ...search, status: option } })}
                        >
                            {statusLabel(option)}
                        </Button>
                    ))}
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground/70">Due</span>
                    {PRESET_OPTIONS.map((preset) => (
                        <button
                            key={preset}
                            type="button"
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
                            className={cn(
                                "rounded-full border px-3 py-1 text-[13px] font-medium transition-colors",
                                search.date_preset === preset
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                            )}
                        >
                            {datePresetLabel(preset)}
                        </button>
                    ))}
                </span>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <input
                        type="checkbox"
                        checked={search.archived}
                        onChange={(e) => navigate({ to: "/todos", search: { ...search, archived: e.target.checked } })}
                    />
                    Show archived
                </label>
            </div>
            {search.date_preset === DatePreset.Custom && (
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                        type="date"
                        aria-label="Start date"
                        className="h-7 rounded-md border border-input bg-card px-2 text-xs outline-none"
                        value={search.start_date}
                        onChange={(e) => navigate({ to: "/todos", search: { ...search, start_date: e.target.value } })}
                    />
                    <span>→</span>
                    <input
                        type="date"
                        aria-label="End date"
                        className="h-7 rounded-md border border-input bg-card px-2 text-xs outline-none"
                        value={search.end_date}
                        onChange={(e) => navigate({ to: "/todos", search: { ...search, end_date: e.target.value } })}
                    />
                </span>
            )}
        </div>
    );
}
