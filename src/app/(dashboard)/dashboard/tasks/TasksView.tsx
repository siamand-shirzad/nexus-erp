"use client";

import { useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Pencil,
  ListTodo,
  FileDown,
  CalendarClock,
  Flag,
  GripVertical,
} from "lucide-react";
import {
  Card,
  Button,
  Badge,
  Input,
  Select,
  Textarea,
  Field,
  Modal,
  EmptyState,
  Avatar,
  PageHeader,
  SearchInput,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { useCollection } from "@/lib/client";
import { exportReportPdf } from "@/lib/pdf";
import { formatDate, isOverdue, cn, titleCase } from "@/lib/utils";
import { priorityTone } from "@/components/ui";
import type { TaskRow } from "@/lib/dto";
import type { TaskStatus, TaskPriority } from "@/db/schema";

const COLUMNS: Array<{ key: TaskStatus; label: string; tone: string; dot: string }> = [
  { key: "todo", label: "To do", tone: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
  { key: "in_progress", label: "In progress", tone: "bg-sky-50 text-sky-700", dot: "bg-sky-500" },
  { key: "done", label: "Done", tone: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
];

interface Person {
  id: string;
  name: string;
  color: string;
  role: string;
}

type FormState = {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string;
  dueDate: string;
};

const blankForm = (selfId: string): FormState => ({
  title: "",
  description: "",
  status: "todo",
  priority: "medium",
  assigneeId: selfId,
  dueDate: "",
});

function toLocalInput(d: string | Date | null) {
  if (!d) return "";
  const date = new Date(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export function TasksView({
  initialTasks,
  people,
  selfId,
}: {
  initialTasks: TaskRow[];
  people: Person[];
  selfId: string;
}) {
  const toast = useToast();
  const { data, create, update, remove } = useCollection<TaskRow>("/api/tasks", initialTasks);
  const [query, setQuery] = useState("");
  const [assignee, setAssignee] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TaskRow | null>(null);
  const [form, setForm] = useState<FormState>(blankForm(selfId));
  const [saving, setSaving] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<TaskStatus | null>(null);

  const filtered = useMemo(
    () =>
      data.filter((t) => {
        if (assignee !== "all" && t.assigneeId !== assignee) return false;
        if (query && !`${t.title} ${t.description ?? ""}`.toLowerCase().includes(query.toLowerCase()))
          return false;
        return true;
      }),
    [data, query, assignee]
  );

  const openCreate = (status: TaskStatus = "todo") => {
    setEditing(null);
    setForm({ ...blankForm(selfId), status });
    setModalOpen(true);
  };
  const openEdit = (t: TaskRow) => {
    setEditing(t);
    setForm({
      title: t.title,
      description: t.description ?? "",
      status: t.status,
      priority: t.priority,
      assigneeId: t.assigneeId ?? "",
      dueDate: toLocalInput(t.dueDate),
    });
    setModalOpen(true);
  };

  async function save() {
    if (!form.title.trim()) return toast.error("Task title is required");
    setSaving(true);
    try {
      const body = {
        ...form,
        dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
      };
      if (editing) {
        await update(editing.id, body, {
          ...editing,
          title: body.title,
          description: body.description || null,
          status: body.status,
          priority: body.priority,
          assigneeId: body.assigneeId || null,
          dueDate: body.dueDate ? new Date(body.dueDate) : null,
          completedAt: body.status === "done" ? new Date() : null,
        });
        toast.success("Task updated", body.title);
      } else {
        await create(body, {
          id: `temp-${Date.now()}`,
          title: body.title,
          description: body.description || null,
          status: body.status,
          priority: body.priority,
          assigneeId: body.assigneeId || null,
          creatorId: selfId,
          dueDate: body.dueDate,
          completedAt: body.status === "done" ? new Date().toISOString() : null,
          createdAt: new Date(),
          assigneeName: people.find((p) => p.id === body.assigneeId)?.name ?? null,
          assigneeColor: people.find((p) => p.id === body.assigneeId)?.color ?? null,
          creatorName: "You",
        } as unknown as TaskRow);
        toast.success("Task created", body.title);
      }
      setModalOpen(false);
    } catch (e) {
      toast.error("Could not save task", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  async function move(t: TaskRow, status: TaskStatus) {
    if (t.status === status) return;
    try {
      await update(
        t.id,
        { status },
        { status, completedAt: status === "done" ? new Date() : null }
      );
      if (status === "done") toast.success("Task completed 🎉", t.title);
    } catch (e) {
      toast.error("Move failed", e instanceof Error ? e.message : undefined);
    }
  }

  async function deleteTask(t: TaskRow) {
    try {
      await remove(t.id);
      toast.success("Task deleted", t.title);
    } catch (e) {
      toast.error("Delete failed", e instanceof Error ? e.message : undefined);
    }
  }

  function exportPdf() {
    exportReportPdf({
      filename: `tasks-${new Date().toISOString().slice(0, 10)}.pdf`,
      title: "Team Task Report",
      subtitle: `${filtered.length} tasks · Generated ${new Date().toLocaleString("en-US")}`,
      summary: [
        { label: "To do", value: String(filtered.filter((t) => t.status === "todo").length) },
        { label: "In progress", value: String(filtered.filter((t) => t.status === "in_progress").length) },
        { label: "Done", value: String(filtered.filter((t) => t.status === "done").length) },
      ],
      columns: ["Task", "Status", "Priority", "Assignee", "Due"],
      rows: filtered.map((t) => [
        t.title,
        titleCase(t.status),
        t.priority,
        t.assigneeName ?? "Unassigned",
        t.dueDate ? formatDate(t.dueDate) : "—",
      ]),
    });
  }

  return (
    <div>
      <PageHeader
        title="Tasks"
        description="Drag cards across columns to update status — changes save instantly."
        actions={
          <>
            <Button variant="secondary" onClick={exportPdf}>
              <FileDown className="h-4 w-4" /> Export
            </Button>
            <Button onClick={() => openCreate()}>
              <Plus className="h-4 w-4" /> New task
            </Button>
          </>
        }
      />

      <Card className="mb-5 flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <SearchInput value={query} onChange={setQuery} placeholder="Search tasks…" className="sm:max-w-xs" />
        <Select
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          placeholder="Everyone"
          options={[{ value: "all", label: "Everyone" }, ...people.map((p) => ({ value: p.id, label: p.name }))]}
          className="sm:w-52"
        />
      </Card>

      {data.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ListTodo className="h-7 w-7" />}
            title="No tasks yet"
            description="Create tasks, assign owners and track due dates on the board."
            action={
              <Button onClick={() => openCreate()}>
                <Plus className="h-4 w-4" /> Create task
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {COLUMNS.map((col) => {
            const cards = filtered.filter((t) => t.status === col.key);
            return (
              <div
                key={col.key}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverCol(col.key);
                }}
                onDragLeave={() => setOverCol((c) => (c === col.key ? null : c))}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain") || dragId;
                  const t = data.find((x) => x.id === id);
                  if (t) move(t, col.key);
                  setDragId(null);
                  setOverCol(null);
                }}
                className={cn(
                  "flex flex-col rounded-2xl border bg-slate-50/70 p-3 transition-colors",
                  overCol === col.key ? "border-indigo-400 bg-indigo-50/50" : "border-slate-200/80"
                )}
              >
                <div className="mb-3 flex items-center justify-between px-1">
                  <span className={cn("inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[12px] font-semibold", col.tone)}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", col.dot)} />
                    {col.label}
                    <span className="opacity-70">{cards.length}</span>
                  </span>
                  <button
                    onClick={() => openCreate(col.key)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-indigo-600"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex flex-1 flex-col gap-2.5">
                  {cards.length === 0 && (
                    <div className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-[12px] text-slate-400">
                      Drop tasks here
                    </div>
                  )}
                  {cards.map((t) => {
                    const overdue = t.dueDate && isOverdue(t.dueDate) && t.status !== "done";
                    const assigneeP = people.find((p) => p.id === t.assigneeId);
                    return (
                      <Card
                        key={t.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", t.id);
                          setDragId(t.id);
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setOverCol(null);
                        }}
                        className={cn(
                          "cursor-grab p-3.5 transition-shadow active:cursor-grabbing hover:shadow-md",
                          dragId === t.id && "opacity-40",
                          t.status === "done" && "opacity-75"
                        )}
                      >
                        <div className="flex items-start gap-1.5">
                          <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                          <p
                            className={cn(
                              "flex-1 text-[13.5px] font-semibold leading-snug text-slate-800",
                              t.status === "done" && "text-slate-400 line-through"
                            )}
                          >
                            {t.title}
                          </p>
                        </div>
                        {t.description && (
                          <p className="mt-1.5 line-clamp-2 pl-5 text-[12px] leading-relaxed text-slate-500">
                            {t.description}
                          </p>
                        )}
                        <div className="mt-3 flex flex-wrap items-center gap-1.5 pl-5">
                          <Badge tone={priorityTone[t.priority]}>
                            <Flag className="h-2.5 w-2.5" />
                            {t.priority}
                          </Badge>
                          {t.dueDate && (
                            <Badge tone={overdue ? "red" : "slate"}>
                              <CalendarClock className="h-2.5 w-2.5" />
                              {formatDate(t.dueDate)}
                            </Badge>
                          )}
                          <div className="ml-auto flex items-center gap-1">
                            {t.assigneeName ? (
                              <span
                                title={t.assigneeName}
                                className="flex items-center"
                              >
                                <Avatar name={t.assigneeName} color={assigneeP?.color ?? null} size={26} />
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-300">unassigned</span>
                            )}
                            <button
                              onClick={() => openEdit(t)}
                              className="rounded-md p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => deleteTask(t)}
                              className="rounded-md p-1 text-slate-300 hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit task" : "New task"}
        description="Assign it, prioritize it and set a due date."
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={save} loading={saving}>{editing ? "Save task" : "Create task"}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Title" required>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Follow up on the Frost Analytics quote" />
          </Field>
          <Field label="Description">
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Status">
              <Select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as TaskStatus })}
                options={COLUMNS.map((c) => ({ value: c.key, label: c.label }))}
              />
            </Field>
            <Field label="Priority">
              <Select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}
                options={[
                  { value: "low", label: "Low" },
                  { value: "medium", label: "Medium" },
                  { value: "high", label: "High" },
                ]}
              />
            </Field>
            <Field label="Assignee">
              <Select
                value={form.assigneeId}
                onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}
                placeholder="Unassigned"
                options={people.map((p) => ({ value: p.id, label: p.name }))}
              />
            </Field>
            <Field label="Due date">
              <Input
                type="datetime-local"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </Field>
          </div>
        </div>
      </Modal>
    </div>
  );
}
