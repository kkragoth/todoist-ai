import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, createFileRoute } from "@tanstack/react-router";
import {
  ApiError,
  archiveTodo,
  createTodo,
  fetchTodos,
  patchTodo,
  unarchiveTodo,
  type Todo,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { useTodosEvents } from "../lib/useTodosEvents";
import { Button } from "../components/ui/button";

export const Route = createFileRoute("/")({
  component: TodosPage,
});

type StatusFilter = "all" | "open" | "done";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function TodosPage() {
  const { isAuthenticated, isLoading, username } = useAuth();
  const queryClient = useQueryClient();
  useTodosEvents(isAuthenticated);

  const [status, setStatus] = useState<StatusFilter>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [dateFilter, setDateFilter] = useState("");
  const [newTask, setNewTask] = useState("");
  const [newDate, setNewDate] = useState(todayISO());
  const [formError, setFormError] = useState<string | null>(null);

  const queryKey = ["todos", status, showArchived, dateFilter];

  const todosQuery = useQuery({
    queryKey,
    queryFn: () =>
      fetchTodos({
        completed: status === "all" ? undefined : status === "done",
        includeArchived: showArchived,
        targetDate: dateFilter || undefined,
      }),
    enabled: isAuthenticated && !isLoading,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["todos"] });

  const createMutation = useMutation({
    mutationFn: (input: { task: string; todo_date: string | null }) => createTodo(input),
    onSuccess: () => {
      setNewTask("");
      setFormError(null);
      invalidate();
    },
    onError: (err) => setFormError(err instanceof ApiError ? err.message : "Could not add todo"),
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, update }: { id: number; update: Parameters<typeof patchTodo>[1] }) =>
      patchTodo(id, update),
    onSuccess: invalidate,
  });

  const archiveMutation = useMutation({
    mutationFn: (id: number) => archiveTodo(id),
    onSuccess: invalidate,
  });

  const unarchiveMutation = useMutation({
    mutationFn: (id: number) => unarchiveTodo(id),
    onSuccess: invalidate,
  });

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    const task = newTask.trim();
    if (!task) return;
    createMutation.mutate({ task, todo_date: newDate || null });
  }

  const todos = todosQuery.data ?? [];
  const openCount = todos.filter((t) => !t.completed && !t.archived).length;

  if (isLoading) return <p className="text-sm text-muted-foreground">Checking session…</p>;
  if (!isAuthenticated) return <Navigate to="/login" />;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          {username ? `${username}'s todos` : "Todos"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {openCount} open · {todos.length} shown
        </p>
      </div>

      {/* Add todo */}
      <form onSubmit={onAdd} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          placeholder="What needs doing?"
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
        />
        <input
          type="date"
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
        />
        <Button type="submit" disabled={createMutation.isPending || !newTask.trim()}>
          {createMutation.isPending ? "Adding…" : "Add"}
        </Button>
      </form>
      {formError && <p className="mt-2 text-sm text-destructive">{formError}</p>}

      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        {(["all", "open", "done"] as StatusFilter[]).map((s) => (
          <Button
            key={s}
            variant={status === s ? "default" : "outline"}
            size="sm"
            onClick={() => setStatus(s)}
          >
            {s === "all" ? "All" : s === "open" ? "Open" : "Done"}
          </Button>
        ))}
        <label className="ml-1 flex items-center gap-1.5 text-muted-foreground">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
        <input
          type="date"
          title="Filter by date"
          className="h-7 rounded-md border border-input bg-background px-2 text-xs outline-none"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
        />
        {dateFilter && (
          <Button variant="ghost" size="xs" onClick={() => setDateFilter("")}>
            Clear date
          </Button>
        )}
      </div>

      {/* List */}
      <div className="mt-4">
        {todosQuery.isPending && <p className="text-sm text-muted-foreground">Loading todos…</p>}
        {todosQuery.isError && (
          <p className="text-sm text-destructive">
            {todosQuery.error instanceof ApiError ? todosQuery.error.message : "Could not load todos."}{" "}
            <Button variant="link" size="sm" onClick={() => todosQuery.refetch()}>
              Retry
            </Button>
          </p>
        )}
        {todosQuery.isSuccess && todos.length === 0 && (
          <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
            Nothing here. Add your first todo above.
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {todos.map((todo) => (
            <TodoRow
              key={todo.id}
              todo={todo}
              onToggle={() => patchMutation.mutate({ id: todo.id, update: { completed: !todo.completed } })}
              onReschedule={(date) => patchMutation.mutate({ id: todo.id, update: { todo_date: date } })}
              onArchive={() => archiveMutation.mutate(todo.id)}
              onRestore={() => unarchiveMutation.mutate(todo.id)}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

function TodoRow({
  todo,
  onToggle,
  onReschedule,
  onArchive,
  onRestore,
}: {
  todo: Todo;
  onToggle: () => void;
  onReschedule: (date: string) => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  return (
    <li
      className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
        todo.archived ? "opacity-60" : ""
      }`}
    >
      <input
        type="checkbox"
        className="size-4 accent-current"
        checked={todo.completed}
        onChange={onToggle}
        title={todo.completed ? "Mark as open" : "Mark as done"}
      />
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-medium ${todo.completed ? "line-through text-muted-foreground" : ""}`}>
          {todo.task}
        </p>
        <p className="text-xs text-muted-foreground">
          #{todo.id} · {todo.todo_date}
          {todo.archived ? " · archived" : ""}
        </p>
      </div>
      <input
        type="date"
        className="h-7 rounded-md border border-input bg-background px-1.5 text-xs outline-none"
        value={todo.todo_date}
        onChange={(e) => e.target.value && onReschedule(e.target.value)}
        title="Reschedule"
      />
      {todo.archived ? (
        <Button variant="outline" size="xs" onClick={onRestore}>
          Restore
        </Button>
      ) : (
        <Button variant="destructive" size="xs" onClick={onArchive}>
          Delete
        </Button>
      )}
    </li>
  );
}
