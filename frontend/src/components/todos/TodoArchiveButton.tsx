import { Button } from "@/components/ui/button";
import { useArchiveTodo, useUnarchiveTodo } from "@/hooks/useTodos";
import { HOVER_REVEAL } from "@/components/todos/OverdueActions";
import { cn } from "cn";

export function TodoArchiveButton({ id, archived }: { id: number; archived: boolean }) {
    const archiveMutation = useArchiveTodo();
    const unarchiveMutation = useUnarchiveTodo();

    if (archived) {
        return (
            <Button
                variant="outline"
                size="xs"
                className={cn("bg-card", HOVER_REVEAL)}
                onClick={() => unarchiveMutation.mutate(id)}
            >
                Restore
            </Button>
        );
    }
    return (
        <Button variant="destructive" size="xs" className={HOVER_REVEAL} onClick={() => archiveMutation.mutate(id)}>
            Delete
        </Button>
    );
}
