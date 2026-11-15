"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  UserRound,
  KeyRound,
  Palette,
  Database,
  ShieldCheck,
  FileDown,
  Users,
  ShoppingCart,
  Package,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import {
  Card,
  Button,
  Input,
  Field,
  ConfirmDialog,
  Badge,
  PageHeader,
  roleTone,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/client";
import { formatDate, titleCase, cn } from "@/lib/utils";
import type { Role } from "@/db/schema";

const COLORS = ["#4f46e5", "#0d9488", "#d946ef", "#f59e0b", "#ef4444", "#0ea5e9", "#8b5cf6", "#16a34a"];

const PERMISSIONS: Record<Role, string[]> = {
  admin: [
    "Full access to every module",
    "Invite, edit and deactivate team members",
    "Reset the demo workspace",
    "Delete any record and issue refunds",
  ],
  manager: [
    "Manage products, orders, customers and tasks",
    "Create and organize teams",
    "Issue invoices and run exports",
    "No access to user administration",
  ],
  seller: [
    "Create and update orders & customers",
    "Move tasks across the board",
    "View catalog and reports",
    "Catalog changes require a manager",
  ],
};

export function SettingsView({
  user,
}: {
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
    title: string;
    department: string;
    phone: string;
    avatarColor: string;
    createdAt: string;
  };
}) {
  const toast = useToast();
  const router = useRouter();
  const [profile, setProfile] = useState({
    name: user.name,
    title: user.title,
    phone: user.phone,
    avatarColor: user.avatarColor,
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [password, setPassword] = useState({ next: "", confirm: "" });
  const [savingPw, setSavingPw] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function saveProfile() {
    if (!profile.name.trim()) return toast.error("Name is required");
    setSavingProfile(true);
    try {
      await apiFetch("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify(profile),
      });
      toast.success("Profile saved", "Your changes are reflected across the app.");
      router.refresh();
    } catch (e) {
      toast.error("Save failed", e instanceof Error ? e.message : undefined);
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword() {
    if (password.next.length < 6)
      return toast.error("Password too short", "Use at least 6 characters.");
    if (password.next !== password.confirm)
      return toast.error("Passwords don't match");
    setSavingPw(true);
    try {
      await apiFetch("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ password: password.next }),
      });
      toast.success("Password updated");
      setPassword({ next: "", confirm: "" });
    } catch (e) {
      toast.error("Update failed", e instanceof Error ? e.message : undefined);
    } finally {
      setSavingPw(false);
    }
  }

  async function resetDemo() {
    setResetting(true);
    try {
      const res = await apiFetch<{ counts: Record<string, number> }>("/api/seed", {
        method: "POST",
      });
      toast.success(
        "Demo data reset",
        `${res.counts.orders} orders, ${res.counts.customers} customers restored.`
      );
      setResetOpen(false);
      setTimeout(() => router.refresh(), 400);
    } catch (e) {
      toast.error("Reset failed", e instanceof Error ? e.message : undefined);
      setResetting(false);
      setResetOpen(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        description={`Workspace member since ${formatDate(user.createdAt)}`}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {/* Profile */}
          <Card className="p-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <UserRound className="h-4.5 w-4.5 text-slate-400" /> Profile
            </h2>
            <p className="mt-0.5 text-[13px] text-slate-500">
              How you appear to your team across orders and tasks.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Full name">
                <Input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
              </Field>
              <Field label="Work email">
                <Input value={user.email} disabled className="bg-slate-50" />
              </Field>
              <Field label="Job title">
                <Input value={profile.title} onChange={(e) => setProfile({ ...profile, title: e.target.value })} />
              </Field>
              <Field label="Phone">
                <Input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} placeholder="+1 (555) 000-0000" />
              </Field>
              <Field label="Avatar color" className="sm:col-span-2">
                <div className="flex gap-2">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setProfile({ ...profile, avatarColor: c })}
                      className={cn(
                        "h-9 w-9 rounded-full ring-2 ring-offset-2 transition-all",
                        profile.avatarColor === c ? "ring-slate-400 scale-110" : "ring-transparent"
                      )}
                      style={{ backgroundColor: c }}
                    >
                      {profile.avatarColor === c && <CheckCircle2 className="mx-auto h-4 w-4 text-white" />}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
            <div className="mt-5 flex justify-end">
              <Button onClick={saveProfile} loading={savingProfile}>
                Save profile
              </Button>
            </div>
          </Card>

          {/* Password */}
          <Card className="p-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <KeyRound className="h-4.5 w-4.5 text-slate-400" /> Password
            </h2>
            <p className="mt-0.5 text-[13px] text-slate-500">
              Choose a strong password of at least 6 characters.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="New password">
                <Input
                  type="password"
                  value={password.next}
                  onChange={(e) => setPassword({ ...password, next: e.target.value })}
                  placeholder="••••••••"
                />
              </Field>
              <Field label="Confirm new password">
                <Input
                  type="password"
                  value={password.confirm}
                  onChange={(e) => setPassword({ ...password, confirm: e.target.value })}
                  placeholder="••••••••"
                />
              </Field>
            </div>
            <div className="mt-5 flex justify-end">
              <Button variant="secondary" onClick={savePassword} loading={savingPw}>
                Update password
              </Button>
            </div>
          </Card>

          {/* Data / exports */}
          <Card className="p-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Database className="h-4.5 w-4.5 text-slate-400" /> Data & exports
            </h2>
            <p className="mt-0.5 text-[13px] text-slate-500">
              Every module exports a branded PDF. Jump to a module and use the Export button.
            </p>
            <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
              {[
                { href: "/dashboard/orders", label: "Orders report", icon: <ShoppingCart className="h-4 w-4" /> },
                { href: "/dashboard/products", label: "Inventory", icon: <Package className="h-4 w-4" /> },
                { href: "/dashboard/team", label: "Team directory", icon: <Users className="h-4 w-4" /> },
              ].map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="flex items-center gap-2.5 rounded-xl border border-slate-200 px-3.5 py-3 text-[13px] font-medium text-slate-700 transition-colors hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-700"
                >
                  {l.icon} {l.label}
                  <FileDown className="ml-auto h-3.5 w-3.5 opacity-50" />
                </Link>
              ))}
            </div>

            {user.role === "admin" && (
              <div className="mt-5 rounded-xl border border-red-200 bg-red-50/60 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[13.5px] font-semibold text-red-800">Reset demo workspace</p>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-red-700/80">
                      Wipes all orders, invoices, products, customers and tasks, then restores
                      the original seed data. Use this to start a fresh demo walkthrough.
                    </p>
                  </div>
                  <Button variant="danger" size="sm" onClick={() => setResetOpen(true)}>
                    Reset data
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Role card */}
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <ShieldCheck className="h-4.5 w-4.5 text-slate-400" /> Your role
            </h2>
            <div className="mt-3 flex items-center gap-3">
              <Badge tone={roleTone[user.role]} className="text-[12px]">
                {titleCase(user.role)}
              </Badge>
              <span className="text-[13px] text-slate-500">{user.department || "Nexus ERP"}</span>
            </div>
            <ul className="mt-4 space-y-2.5">
              {PERMISSIONS[user.role].map((p) => (
                <li key={p} className="flex items-start gap-2.5 text-[13px] leading-relaxed text-slate-600">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  {p}
                </li>
              ))}
            </ul>
          </Card>

          <Card className="overflow-hidden">
            <div className="bg-slate-950 p-5 text-white">
              <Palette className="h-5 w-5 text-indigo-300" />
              <p className="mt-2 text-sm font-semibold">Nexus ERP · Demo</p>
              <p className="mt-1 text-[12px] leading-relaxed text-slate-400">
                Pre-loaded with 6 users, 24 products, 18 customers, 42 orders, invoices and
                tasks. Sign in as another role from the login screen to explore permissions.
              </p>
            </div>
            <div className="p-5">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-slate-400">
                Demo credentials
              </p>
              <div className="mt-2 space-y-1.5 text-[12.5px] text-slate-600">
                <p><span className="font-semibold text-slate-800">admin@nexus.io</span> · admin</p>
                <p><span className="font-semibold text-slate-800">daniel@nexus.io</span> · manager</p>
                <p><span className="font-semibold text-slate-800">maya@nexus.io</span> · seller</p>
                <p className="text-slate-400">password: demo1234</p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={resetDemo}
        loading={resetting}
        confirmLabel="Yes, reset everything"
        title="Reset all demo data?"
        message="Every record will be deleted and the original seeded workspace restored. This cannot be undone."
      />
    </div>
  );
}
