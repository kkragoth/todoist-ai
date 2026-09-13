import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { API_BASE, getToken } from "./api";

/**
 * Live-updates the todo list: opens the backend SSE stream and invalidates
 * the ["todos"] queries whenever anything (CLI, another tab, this tab)
 * changes a todo. React Query then refetches with the active filters.
 * EventSource reconnects by itself if the connection drops.
 */
export function useTodosEvents(enabled: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    const token = getToken();
    if (!token) return;
    const es = new EventSource(
      `${API_BASE}/api/todos/events?token=${encodeURIComponent(token)}`
    );
    es.onmessage = () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    };
    return () => es.close();
  }, [enabled, queryClient]);
}
