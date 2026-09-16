import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { ChevronRight } from "lucide-react";
import { cn } from "cn";
import { TodoRows } from "@/components/todos/TodoRows";
import type { Todo } from "@/lib/api";

/** Flat-list-only Done section. Collapsed state is local — no other view reads it. */
export function DoneSection({ doneTodos, forceFlat }: { doneTodos: Todo[]; forceFlat: boolean }) {
    const [expanded, setExpanded] = useState(false);
    if (doneTodos.length === 0) return null;

    return (
        <section className="mt-5">
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                {forceFlat ? (
                    <ul>
                        <TodoRows todos={doneTodos} bucket={null} />
                    </ul>
                ) : (
                    <>
                        <button
                            type="button"
                            onClick={() => setExpanded((v) => !v)}
                            className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground"
                        >
                            <ChevronRight className={cn("size-4 transition-transform", expanded && "rotate-90")} />
                            Done ({doneTodos.length})
                        </button>
                        {expanded && (
                            <ul className="border-t border-border/50">
                                <AnimatePresence initial={false}>
                                    <TodoRows todos={doneTodos} bucket={null} />
                                </AnimatePresence>
                            </ul>
                        )}
                    </>
                )}
            </div>
        </section>
    );
}
