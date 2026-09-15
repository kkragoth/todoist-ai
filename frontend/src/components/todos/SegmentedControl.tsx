// One shared segmented-control style reused for both filter bars
// (date presets + status) so the two rows read as the same component.
import { SegmentedOption, type SegmentedItem } from "@/components/todos/SegmentedOption";

export function SegmentedControl({
    label,
    items,
    selected,
    onSelect,
}: {
    label: string;
    items: SegmentedItem[];
    selected: string;
    onSelect: (value: string) => void;
}) {
    return (
        <div
            role="group"
            aria-label={label}
            className="flex items-center gap-0.5 overflow-x-auto rounded-lg border border-border bg-muted p-0.5"
        >
            {items.map((item) => (
                <SegmentedOption key={item.value} item={item} selected={selected === item.value} onSelect={onSelect} />
            ))}
        </div>
    );
}
