import { create } from "zustand";
import { todayISO } from "@/lib/todos-filters";
import { TodoBucket } from "@/lib/todo-buckets";
import { Density, ListSort, TodoView, defaultCollapsedBuckets, type CollapsedBuckets } from "@/lib/todos-view";

/** Transient todos UI state. Shareable filter state lives in the URL. */
interface TodosUiState {
    newTask: string;
    newDate: string;
    formError: string | null;
    searchText: string;
    assistantOpen: boolean;
    doneExpanded: boolean;
    view: TodoView;
    listSort: ListSort;
    density: Density;
    collapsedBuckets: CollapsedBuckets;
    /** IDs that should play the SSE entry flash. Cleared after the animation. */
    flashIds: number[];
    /** IDs currently playing the complete (strike-through + exit) animation. */
    completingIds: number[];
    setNewTask: (task: string) => void;
    setNewDate: (date: string) => void;
    setFormError: (error: string | null) => void;
    setSearchText: (text: string) => void;
    setAssistantOpen: (open: boolean) => void;
    setDoneExpanded: (expanded: boolean) => void;
    setView: (view: TodoView) => void;
    setListSort: (sort: ListSort) => void;
    setDensity: (density: Density) => void;
    toggleBucketCollapsed: (bucket: TodoBucket) => void;
    setBucketCollapsed: (bucket: TodoBucket, collapsed: boolean) => void;
    expandAllBuckets: () => void;
    collapseAllBuckets: () => void;
    flashTodos: (ids: number[]) => void;
    clearFlash: () => void;
    markCompleting: (id: number) => void;
    unmarkCompleting: (id: number) => void;
    resetForm: () => void;
}

export const useTodosUiStore = create<TodosUiState>()((set) => ({
    newTask: "",
    newDate: todayISO(),
    formError: null,
    searchText: "",
    assistantOpen: false,
    doneExpanded: false,
    view: TodoView.Grouped,
    listSort: ListSort.Asc,
    density: Density.Comfortable,
    collapsedBuckets: defaultCollapsedBuckets(),
    flashIds: [],
    completingIds: [],
    setNewTask: (newTask) => set({ newTask }),
    setNewDate: (newDate) => set({ newDate }),
    setFormError: (formError) => set({ formError }),
    setSearchText: (searchText) => set({ searchText }),
    setAssistantOpen: (assistantOpen) => set({ assistantOpen }),
    setDoneExpanded: (doneExpanded) => set({ doneExpanded }),
    setView: (view) => set({ view }),
    setListSort: (listSort) => set({ listSort }),
    setDensity: (density) => set({ density }),
    toggleBucketCollapsed: (bucket) =>
        set((s) => ({ collapsedBuckets: { ...s.collapsedBuckets, [bucket]: !s.collapsedBuckets[bucket] } })),
    setBucketCollapsed: (bucket, collapsed) =>
        set((s) => ({ collapsedBuckets: { ...s.collapsedBuckets, [bucket]: collapsed } })),
    expandAllBuckets: () => set({ collapsedBuckets: defaultCollapsedBuckets() }),
    collapseAllBuckets: () =>
        set((s) => {
            const next = { ...s.collapsedBuckets };
            for (const bucket of Object.values(TodoBucket)) {
                next[bucket] = true;
            }
            return { collapsedBuckets: next };
        }),
    flashTodos: (ids) => set({ flashIds: ids }),
    clearFlash: () => set({ flashIds: [] }),
    markCompleting: (id) => set((s) => ({ completingIds: [...s.completingIds, id] })),
    unmarkCompleting: (id) => set((s) => ({ completingIds: s.completingIds.filter((x) => x !== id) })),
    resetForm: () => set({ newTask: "", formError: null, newDate: todayISO() }),
}));
