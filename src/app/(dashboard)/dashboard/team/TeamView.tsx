"use client";

import { useState } from "react";
import {
  UserPlus,
  Pencil,
  Trash2,
  MoreHorizontal,
  FileDown,
  UserCog,
  Users2,
  Mail,
  Crown,
  Plus,
  ShoppingCart,
  ContactRound,
  ListTodo,
  ShieldCheck,
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
  ConfirmDialog,
  Dropdown,
  EmptyState,
  Avatar,
  PageHeader,
  roleTone,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { useCollection } from "@/lib/client";
import { exportReportPdf } from "@/lib/pdf";
import { titleCase, cn } from "@/lib/utils";
import type { TeamMemberRow, TeamRow } from "@/lib/dto";
import type { Role } from "@/db/schema";

const COLORS = ["#4f46e5", "#0d9488", "#d946ef", "#f59e0b", "#ef4444", "#0ea5e9", "#8b5cf6", "#16a34a"];

type MemberForm = {
  name: string;
  email: string;
  role: Role;
  title: string;
  department: string;
  phone: string;
  password: string;
};

type TeamForm = {
  name: string;
  description: string;
  leadId: string;
  memberIds: string[];
};

export function TeamView({
  initialMembers,
  initialTeams,
  role,
}: {
  initialMembers: TeamMemberRow[];
  initialTeams: TeamRow[];
  role: Role;
}) {
  const toast = useToast();
  const isAdmin = role === "admin";
  const {
    data: members,
    create: createMember,
    update: updateMember,
    remove: removeMember,
  } = useCollection<TeamMemberRow>("/api/team", initialMembers);
  const teams = useCollection<TeamRow>("/api/teams", initialTeams);

  const [memberModal, setMemberModal] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMemberRow | null>(null);
  const [memberForm, setMemberForm] = useState<MemberForm>({
    name: "",
    email: "",
    role: "seller",
    title: "",
    department: "Sales",
    phone: "",
    password: "",
  });
  const [memberSaving, setMemberSaving] = useState(false);
  const [deletingMember, setDeletingMember] = useState<TeamMemberRow | null>(null);
  const [memberDeleting, setMemberDeleting] = useState(false);

  const [teamModal, setTeamModal] = useState(false);
  const [editingTeam, setEditingTeam] = useState<TeamRow | null>(null);
  const [teamForm, setTeamForm] = useState<TeamForm>({
    name: "",
    description: "",
    leadId: "",
    memberIds: [],
  });
  const [teamSaving, setTeamSaving] = useState(false);
  const [deletingTeam, setDeletingTeam] = useState<TeamRow | null>(null);

  // ---- Member modal ----
  function openCreateMember() {
    setEditingMember(null);
    setMemberForm({ name: "", email: "", role: "seller", title: "", department: "Sales", phone: "", password: "" });
    setMemberModal(true);
  }
  function openEditMember(m: TeamMemberRow) {
    setEditingMember(m);
    setMemberForm({
      name: m.name,
      email: m.email,
      role: m.role,
      title: m.title ?? "",
      department: m.department ?? "",
      phone: m.phone ?? "",
      password: "",
    });
    setMemberModal(true);
  }

  async function saveMember() {
    if (!memberForm.name.trim() || !memberForm.email.trim())
      return toast.error("Name and email are required");
    setMemberSaving(true);
    try {
      if (editingMember) {
        const body: Record<string, unknown> = {
          name: memberForm.name,
          role: memberForm.role,
          title: memberForm.title,
          department: memberForm.department,
          phone: memberForm.phone,
        };
        if (memberForm.password) body.password = memberForm.password;
        await updateMember(editingMember.id, body, {
          ...editingMember,
          name: body.name as string,
          role: body.role as Role,
          title: (body.title as string) || null,
          department: (body.department as string) || null,
          phone: (body.phone as string) || null,
        });
        toast.success("Member updated", memberForm.name);
      } else {
        await createMember(memberForm, {
          id: `temp-${Date.now()}`,
          name: memberForm.name,
          email: memberForm.email,
          role: memberForm.role,
          title: memberForm.title || null,
          department: memberForm.department || null,
          phone: memberForm.phone || null,
          avatarColor: COLORS[members.length % COLORS.length],
          status: "active",
          createdAt: new Date(),
          orderCount: 0,
          customerCount: 0,
          openTasks: 0,
          teamIds: [],
        });
        toast.success("Invitation sent", `${memberForm.name} can sign in with ${memberForm.email} and the password you set.`);
      }
      setMemberModal(false);
    } catch (e) {
      toast.error("Could not save member", e instanceof Error ? e.message : undefined);
    } finally {
      setMemberSaving(false);
    }
  }

  async function confirmDeleteMember() {
    if (!deletingMember) return;
    setMemberDeleting(true);
    try {
      const res = await fetch(`/api/team/${deletingMember.id}`, { method: "DELETE" }).then((r) => r.json());
      if (res?.error) throw new Error(res.error);
      if (res?.deactivated) {
        await updateMember(deletingMember.id, { status: "disabled" }, { status: "disabled" }).catch(() => {});
        toast.success("Member deactivated", "Their history is preserved.");
      } else {
        await removeMember(deletingMember.id).catch(() => {});
        toast.success("Member removed", deletingMember.name);
      }
      setDeletingMember(null);
    } catch (e) {
      toast.error("Action failed", e instanceof Error ? e.message : undefined);
      setDeletingMember(null);
    } finally {
      setMemberDeleting(false);
    }
  }

  // ---- Team modal ----
  function openCreateTeam() {
    setEditingTeam(null);
    setTeamForm({ name: "", description: "", leadId: "", memberIds: [] });
    setTeamModal(true);
  }
  function openEditTeam(t: TeamRow) {
    setEditingTeam(t);
    setTeamForm({
      name: t.name,
      description: t.description ?? "",
      leadId: t.leadId ?? "",
      memberIds: t.members.map((m) => m.id),
    });
    setTeamModal(true);
  }

  async function saveTeam() {
    if (!teamForm.name.trim()) return toast.error("Team name is required");
    setTeamSaving(true);
    try {
      if (editingTeam) {
        await teams.update(editingTeam.id, teamForm, {
          ...editingTeam,
          name: teamForm.name,
          description: teamForm.description || null,
          leadId: teamForm.leadId || null,
        });
        toast.success("Team updated", teamForm.name);
      } else {
        await teams.create(teamForm, {
          id: `temp-${Date.now()}`,
          name: teamForm.name,
          description: teamForm.description || null,
          leadId: teamForm.leadId || null,
          createdAt: new Date(),
          leadName: members.find((m) => m.id === teamForm.leadId)?.name ?? null,
          members: [],
          memberCount: 0,
        });
        toast.success("Team created", teamForm.name);
      }
      setTeamModal(false);
    } catch (e) {
      toast.error("Could not save team", e instanceof Error ? e.message : undefined);
    } finally {
      setTeamSaving(false);
    }
  }

  async function confirmDeleteTeam() {
    if (!deletingTeam) return;
    try {
      await teams.remove(deletingTeam.id);
      toast.success("Team deleted", deletingTeam.name);
      setDeletingTeam(null);
    } catch (e) {
      toast.error("Delete failed", e instanceof Error ? e.message : undefined);
      setDeletingTeam(null);
    }
  }

  function exportDirectory() {
    exportReportPdf({
      filename: `team-directory-${new Date().toISOString().slice(0, 10)}.pdf`,
      title: "Team Directory",
      subtitle: `${members.length} members · Generated ${new Date().toLocaleString("en-US")}`,
      summary: [
        { label: "Members", value: String(members.length) },
        { label: "Teams", value: String(teams.data.length) },
        { label: "Active", value: String(members.filter((m) => m.status === "active").length) },
      ],
      columns: ["Name", "Role", "Title", "Department", "Email", "Orders", "Customers"],
      rows: members.map((m) => [
        m.name,
        titleCase(m.role),
        m.title ?? "—",
        m.department ?? "—",
        m.email,
        String(m.orderCount),
        String(m.customerCount),
      ]),
    });
  }

  const memberName = (id: string | null) => members.find((m) => m.id === id)?.name ?? null;

  return (
    <div>
      <PageHeader
        title="Team Management"
        description={`${members.filter((m) => m.status === "active").length} active members across ${teams.data.length} teams`}
        actions={
          <>
            <Button variant="secondary" onClick={exportDirectory}>
              <FileDown className="h-4 w-4" /> Directory
            </Button>
            {role !== "seller" && (
              <Button variant="secondary" onClick={openCreateTeam}>
                <Users2 className="h-4 w-4" /> New team
              </Button>
            )}
            {isAdmin && (
              <Button onClick={openCreateMember}>
                <UserPlus className="h-4 w-4" /> Invite member
              </Button>
            )}
          </>
        }
      />

      {/* Members grid */}
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
        <UserCog className="h-4 w-4 text-slate-400" /> Members
      </h2>
      {members.length === 0 ? (
        <Card className="mb-8">
          <EmptyState
            icon={<UserCog className="h-7 w-7" />}
            title="No members yet"
            description="Invite your sellers and managers to collaborate in the workspace."
            action={
              isAdmin ? (
                <Button onClick={openCreateMember}>
                  <UserPlus className="h-4 w-4" /> Invite member
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {members.map((m) => (
            <Card
              key={m.id}
              className={cn(
                "relative p-5 transition-shadow hover:shadow-md",
                m.status === "disabled" && "opacity-65"
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Avatar name={m.name} color={m.avatarColor} size={46} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">
                      {m.name}
                      {m.role === "admin" && <Crown className="ml-1 inline h-3.5 w-3.5 text-amber-500" />}
                    </p>
                    <p className="truncate text-[12px] text-slate-500">{m.title ?? "Team member"}</p>
                  </div>
                </div>
                {isAdmin && (
                  <Dropdown
                    trigger={
                      <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                        <MoreHorizontal className="h-4.5 w-4.5" />
                      </button>
                    }
                    items={[
                      { label: "Edit", icon: <Pencil className="h-4 w-4" />, onClick: () => openEditMember(m) },
                      {
                        label: m.status === "disabled" ? "Reactivate" : "Deactivate / delete",
                        icon: <Trash2 className="h-4 w-4" />,
                        onClick: () => setDeletingMember(m),
                        danger: true,
                      },
                    ]}
                  />
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-1.5">
                <Badge tone={roleTone[m.role]} dot>
                  {titleCase(m.role)}
                </Badge>
                {m.status === "disabled" && <Badge tone="slate">Disabled</Badge>}
                {m.department && <Badge tone="slate">{m.department}</Badge>}
              </div>

              <p className="mt-3 flex items-center gap-2 truncate text-[12px] text-slate-500">
                <Mail className="h-3.5 w-3.5 shrink-0 text-slate-300" /> {m.email}
              </p>

              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center">
                <div>
                  <p className="flex items-center justify-center gap-1 text-[13px] font-bold text-slate-900 tnum">
                    <ShoppingCart className="h-3 w-3 text-slate-300" /> {m.orderCount}
                  </p>
                  <p className="text-[10.5px] uppercase tracking-wide text-slate-400">Orders</p>
                </div>
                <div>
                  <p className="flex items-center justify-center gap-1 text-[13px] font-bold text-slate-900 tnum">
                    <ContactRound className="h-3 w-3 text-slate-300" /> {m.customerCount}
                  </p>
                  <p className="text-[10.5px] uppercase tracking-wide text-slate-400">Customers</p>
                </div>
                <div>
                  <p className="flex items-center justify-center gap-1 text-[13px] font-bold text-slate-900 tnum">
                    <ListTodo className="h-3 w-3 text-slate-300" /> {m.openTasks}
                  </p>
                  <p className="text-[10.5px] uppercase tracking-wide text-slate-400">Open tasks</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Teams */}
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Users2 className="h-4 w-4 text-slate-400" /> Teams
      </h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {teams.data.length === 0 && (
          <Card className="md:col-span-2 xl:col-span-3">
            <EmptyState
              icon={<Users2 className="h-7 w-7" />}
              title="No teams yet"
              description="Group reps into teams with a named lead for clearer ownership."
              action={
                role !== "seller" ? (
                  <Button onClick={openCreateTeam}>
                    <Plus className="h-4 w-4" /> Create team
                  </Button>
                ) : undefined
              }
            />
          </Card>
        )}
        {teams.data.map((t) => (
          <Card key={t.id} className="p-5 transition-shadow hover:shadow-md">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-bold text-slate-900">{t.name}</p>
                <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-relaxed text-slate-500">
                  {t.description ?? "No description"}
                </p>
              </div>
              {role !== "seller" && (
                <Dropdown
                  trigger={
                    <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                      <MoreHorizontal className="h-4.5 w-4.5" />
                    </button>
                  }
                  items={[
                    { label: "Edit", icon: <Pencil className="h-4 w-4" />, onClick: () => openEditTeam(t) },
                    { label: "Delete", icon: <Trash2 className="h-4 w-4" />, onClick: () => setDeletingTeam(t), danger: true },
                  ]}
                />
              )}
            </div>
            <div className="mt-4 flex items-center gap-2 text-[12.5px] text-slate-600">
              <ShieldCheck className="h-4 w-4 text-teal-500" />
              Lead: <span className="font-semibold">{t.leadName ?? "Unassigned"}</span>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="flex -space-x-2">
                {t.members.slice(0, 5).map((mem) => (
                  <Avatar key={mem.id} name={mem.name} color={mem.avatarColor} size={30} className="ring-2 ring-white" />
                ))}
                {t.members.length > 5 && (
                  <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600 ring-2 ring-white">
                    +{t.members.length - 5}
                  </span>
                )}
              </div>
              <span className="text-[11.5px] font-medium text-slate-400">
                {t.memberCount} member{t.memberCount === 1 ? "" : "s"}
              </span>
            </div>
          </Card>
        ))}
      </div>

      {/* Member modal */}
      <Modal
        open={memberModal}
        onClose={() => setMemberModal(false)}
        title={editingMember ? "Edit member" : "Invite team member"}
        description={
          editingMember
            ? `Editing ${editingMember.name}`
            : "New members sign in with their email and password."
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setMemberModal(false)}>Cancel</Button>
            <Button onClick={saveMember} loading={memberSaving}>
              {editingMember ? "Save changes" : "Send invite"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required>
            <Input value={memberForm.name} onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })} />
          </Field>
          <Field label="Work email" required>
            <Input type="email" value={memberForm.email} onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })} disabled={!!editingMember} />
          </Field>
          <Field label="Role">
            <Select
              value={memberForm.role}
              disabled={!isAdmin}
              onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value as Role })}
              options={[
                { value: "admin", label: "Administrator" },
                { value: "manager", label: "Sales Manager" },
                { value: "seller", label: "Seller / AE" },
              ]}
            />
          </Field>
          <Field label="Department">
            <Input value={memberForm.department} onChange={(e) => setMemberForm({ ...memberForm, department: e.target.value })} />
          </Field>
          <Field label="Job title" className="sm:col-span-2">
            <Input value={memberForm.title} onChange={(e) => setMemberForm({ ...memberForm, title: e.target.value })} placeholder="Account Executive" />
          </Field>
          <Field label="Phone">
            <Input value={memberForm.phone} onChange={(e) => setMemberForm({ ...memberForm, phone: e.target.value })} />
          </Field>
          <Field
            label={editingMember ? "New password" : "Initial password"}
            hint={editingMember ? "Leave blank to keep current password" : 'Defaults to "welcome123"'}
          >
            <Input
              type="text"
              value={memberForm.password}
              onChange={(e) => setMemberForm({ ...memberForm, password: e.target.value })}
              placeholder="••••••••"
            />
          </Field>
        </div>
      </Modal>

      {/* Team modal */}
      <Modal
        open={teamModal}
        onClose={() => setTeamModal(false)}
        title={editingTeam ? "Edit team" : "New team"}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setTeamModal(false)}>Cancel</Button>
            <Button onClick={saveTeam} loading={teamSaving}>{editingTeam ? "Save" : "Create team"}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Team name" required>
              <Input value={teamForm.name} onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })} placeholder="Field Sales" />
            </Field>
            <Field label="Team lead">
              <Select
                value={teamForm.leadId}
                onChange={(e) => setTeamForm({ ...teamForm, leadId: e.target.value })}
                placeholder="Select lead"
                options={members.map((m) => ({ value: m.id, label: m.name }))}
              />
            </Field>
          </div>
          <Field label="Description">
            <Textarea value={teamForm.description} onChange={(e) => setTeamForm({ ...teamForm, description: e.target.value })} />
          </Field>
          <Field label="Members">
            <div className="grid max-h-52 gap-1.5 overflow-y-auto rounded-xl border border-slate-200 p-2.5 sm:grid-cols-2">
              {members.map((m) => {
                const checked = teamForm.memberIds.includes(m.id);
                return (
                  <label
                    key={m.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] transition-colors",
                      checked ? "bg-indigo-50 text-indigo-800" : "hover:bg-slate-50"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setTeamForm((f) => ({
                          ...f,
                          memberIds: checked
                            ? f.memberIds.filter((id) => id !== m.id)
                            : [...f.memberIds, m.id],
                        }))
                      }
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <Avatar name={m.name} color={m.avatarColor} size={24} />
                    <span className="font-medium">{m.name}</span>
                  </label>
                );
              })}
            </div>
          </Field>
          <p className="text-[12px] text-slate-400">
            {teamForm.memberIds.length} selected · Lead: {memberName(teamForm.leadId) ?? "—"}
          </p>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deletingMember}
        onClose={() => setDeletingMember(null)}
        onConfirm={confirmDeleteMember}
        loading={memberDeleting}
        confirmLabel={deletingMember?.orderCount || deletingMember?.customerCount ? "Deactivate" : "Delete"}
        title="Remove member?"
        message={
          deletingMember?.orderCount || deletingMember?.customerCount
            ? `${deletingMember?.name} owns orders or customers, so they will be deactivated (login blocked) while all history is preserved. Continue?`
            : `${deletingMember?.name} has no linked records and will be permanently removed.`
        }
      />
      <ConfirmDialog
        open={!!deletingTeam}
        onClose={() => setDeletingTeam(null)}
        onConfirm={confirmDeleteTeam}
        title="Delete team?"
        message={`${deletingTeam?.name} will be deleted. Members keep their accounts.`}
      />
    </div>
  );
}
