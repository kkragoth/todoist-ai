import { create } from "zustand";
import { todayISO } from "@/lib/todos-filters";

/** Transient todos UI state (new-todo form). Shareable filter state lives in the URL. */
interface TodosUiState {
    newTask: string;
    newDate: string;
    formError: string | null;
    setNewTask: (task: string) => void;
    setNewDate: (date: string) => void;
    setFormError: (error: string | null) => void;
    resetForm: () => void;
}

export const useTodosUiStore = create<TodosUiState>()((set) => ({
    newTask: "",
    newDate: todayISO(),
    formError: null,
    setNewTask: (newTask) => set({ newTask }),
    setNewDate: (newDate) => set({ newDate }),
    setFormError: (formError) => set({ formError }),
    resetForm: () => set({ newTask: "", formError: null, newDate: todayISO() }),
}));
