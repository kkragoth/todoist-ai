import { cn } from "cn";

export interface SegmentedItem {
    value: string;
    label: string;
}

export function SegmentedOption({
    item,
    selected,
    onSelect,
}: {
    item: SegmentedItem;
    selected: boolean;
    onSelect: (value: string) => void;
}) {
    return (
        <button
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(item.value)}
            className={cn(
                "rounded-md px-3 py-1 text-[13px] font-medium whitespace-nowrap transition-colors",
                selected
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
            )}
        >
            {item.label}
        </button>
    );
}
