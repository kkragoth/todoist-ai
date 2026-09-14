import { create } from "zustand";
import { todayISO } from "@/lib/todos-filters";

/** Transient todos UI state. Shareable filter state lives in the URL. */
interface TodosUiState {
    newTask: string;
    newDate: string;
    formError: string | null;
    searchText: string;
    assistantOpen: boolean;
    doneExpanded: boolean;
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
    flashIds: [],
    completingIds: [],
    setNewTask: (newTask) => set({ newTask }),
    setNewDate: (newDate) => set({ newDate }),
    setFormError: (formError) => set({ formError }),
    setSearchText: (searchText) => set({ searchText }),
    setAssistantOpen: (assistantOpen) => set({ assistantOpen }),
    setDoneExpanded: (doneExpanded) => set({ doneExpanded }),
    flashTodos: (ids) => set({ flashIds: ids }),
    clearFlash: () => set({ flashIds: [] }),
    markCompleting: (id) => set((s) => ({ completingIds: [...s.completingIds, id] })),
    unmarkCompleting: (id) => set((s) => ({ completingIds: s.completingIds.filter((x) => x !== id) })),
    resetForm: () => set({ newTask: "", formError: null, newDate: todayISO() }),
}));
