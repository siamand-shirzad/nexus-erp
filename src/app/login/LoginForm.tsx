"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  FileText,
  CheckCircle2,
  ArrowRight,
  Loader2,
  Eye,
  EyeOff,
} from "lucide-react";
import { apiFetch } from "@/lib/client";
import { Button, Input } from "@/components/ui";

const DEMO = [
  {
    email: "admin@nexus.io",
    password: "demo1234",
    name: "Ava Mitchell",
    role: "Administrator",
    tone: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  },
  {
    email: "daniel@nexus.io",
    password: "demo1234",
    name: "Daniel Ruiz",
    role: "Sales Manager",
    tone: "bg-teal-50 text-teal-700 ring-teal-200",
  },
  {
    email: "maya@nexus.io",
    password: "demo1234",
    name: "Maya Chen",
    role: "Account Executive",
    tone: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200",
  },
];

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@nexus.io");
  const [password, setPassword] = useState("demo1234");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-white">
      {/* Brand panel */}
      <div className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-slate-950 p-12 text-white lg:flex">
        <div
          className="absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(900px 500px at 15% -10%, rgba(99,102,241,0.55), transparent 60%), radial-gradient(700px 500px at 110% 110%, rgba(16,185,129,0.35), transparent 55%)",
          }}
        />
        <div className="relative flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold shadow-lg shadow-indigo-900/50">
            N
          </span>
          <span className="text-lg font-semibold tracking-tight">Nexus ERP</span>
        </div>

        <div className="relative">
          <h1 className="text-4xl font-bold leading-tight tracking-tight">
            Run your whole business from one workspace.
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-slate-300">
            Orders, inventory, customers, invoices and your team — unified with
            real-time dashboards and one-click PDF exports.
          </p>
          <div className="mt-8 grid gap-3">
            {[
              { icon: <ShoppingCart className="h-4.5 w-4.5" />, label: "Order-to-invoice pipeline with live statuses" },
              { icon: <LayoutDashboard className="h-4.5 w-4.5" />, label: "Revenue dashboards, KPIs and low-stock alerts" },
              { icon: <Users className="h-4.5 w-4.5" />, label: "Role-based access: admins, managers and sellers" },
              { icon: <FileText className="h-4.5 w-4.5" />, label: "Branded invoice & report PDF generation" },
            ].map((f) => (
              <div key={f.label} className="flex items-center gap-3 text-sm text-slate-200">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-indigo-200">
                  {f.icon}
                </span>
                {f.label}
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-slate-400">
          © 2026 Nexus ERP, Inc. · Demo workspace pre-loaded with sample data
        </p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm animate-slide-up">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white">
              N
            </span>
            <span className="text-lg font-semibold tracking-tight">Nexus ERP</span>
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Welcome back
          </h2>
          <p className="mt-1.5 text-sm text-slate-500">
            Sign in to your operations workspace.
          </p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                Work email
              </label>
              <Input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                Password
              </label>
              <div className="relative">
                <Input
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] font-medium text-red-700 animate-fade-in">
                {error}
              </div>
            )}

            <Button type="submit" size="lg" className="w-full" loading={loading}>
              {!loading && <>Sign in <ArrowRight className="h-4 w-4" /></>}
              {loading && "Signing in…"}
            </Button>
          </form>

          <div className="mt-8">
            <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-wider text-slate-400">
              <span className="h-px flex-1 bg-slate-200" />
              Demo accounts · click to fill
              <span className="h-px flex-1 bg-slate-200" />
            </div>
            <div className="mt-3 space-y-2">
              {DEMO.map((d) => (
                <button
                  key={d.email}
                  type="button"
                  onClick={() => {
                    setEmail(d.email);
                    setPassword(d.password);
                    setError(null);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-left ring-1 ring-inset transition-all hover:scale-[1.01] ${d.tone}`}
                >
                  <div>
                    <p className="text-[13px] font-semibold">{d.name}</p>
                    <p className="text-xs opacity-75">{d.email}</p>
                  </div>
                  <span className="flex items-center gap-1 text-xs font-semibold">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {d.role}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-4 text-center text-xs text-slate-400">
              All demo accounts use password <span className="font-semibold text-slate-600">demo1234</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
