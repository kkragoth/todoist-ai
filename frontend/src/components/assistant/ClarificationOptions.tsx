import { ClarificationOption } from "@/components/assistant/ClarificationOption";

export function ClarificationOptions({ options }: { options: string[] }) {
    return (
        <div className="mt-1.5 flex flex-col gap-1">
            {options.map((option, i) => (
                <ClarificationOption key={option} option={option} index={i} />
            ))}
        </div>
    );
}
