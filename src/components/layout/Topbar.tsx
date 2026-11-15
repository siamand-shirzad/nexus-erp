"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu, Bell, LogOut, Settings, UserRound, Activity } from "lucide-react";
import { Avatar, Dropdown, Skeleton } from "@/components/ui";
import { apiFetch } from "@/lib/client";
import { relativeTime, cn } from "@/lib/utils";
import type { Role } from "@/db/schema";
import type { ActivityRow } from "@/lib/dto";

const TITLES: Array<[string, string]> = [
  ["/accounting", "Accounting"],
  ["/dashboard/orders", "Orders"],
  ["/dashboard/invoices", "Invoices"],
  ["/dashboard/customers", "Customers"],
  ["/dashboard/products", "Products"],
  ["/dashboard/tasks", "Tasks"],
  ["/dashboard/team", "Team Management"],
  ["/dashboard/settings", "Settings"],
];

function actionIcon(action: string) {
  const map: Record<string, string> = {
    order: "🛒",
    invoice: "🧾",
    customer: "👤",
    product: "📦",
    task: "✅",
    team: "👥",
    report: "📄",
  };
  return map[action.split(".")[0]] ?? "•";
}

export function Topbar({
  user,
  onMenu,
}: {
  user: { id: string; name: string; email: string; role: Role; title: string; avatarColor: string };
  onMenu: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [notifOpen, setNotifOpen] = useState(false);
  const [activity, setActivity] = useState<ActivityRow[] | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const title =
    pathname === "/dashboard"
      ? "Dashboard"
      : TITLES.find(([p]) => pathname.startsWith(p))?.[1] ?? "Dashboard";

  useEffect(() => {
    if (!notifOpen) return;
    apiFetch<ActivityRow[]>("/api/activities")
      .then((rows) => setActivity(rows.slice(0, 7)))
      .catch(() => setActivity([]));
  }, [notifOpen]);

  async function signOut() {
    setSigningOut(true);
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <header className="print:hidden sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/85 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      <button
        onClick={onMenu}
        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>

      <div className="ml-auto flex items-center gap-1.5">
        <div
          className="relative"
          onMouseEnter={() => {
            if (closeTimer.current) clearTimeout(closeTimer.current);
          }}
          onMouseLeave={() => {
            closeTimer.current = setTimeout(() => setNotifOpen(false), 200);
          }}
        >
          <button
            onClick={() => setNotifOpen((v) => !v)}
            className="relative rounded-xl p-2.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Activity"
          >
            <Bell className="h-5 w-5" />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-indigo-500 ring-2 ring-white" />
          </button>
          {notifOpen && (
            <div className="absolute right-0 top-12 z-40 w-[340px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl animate-scale-in">
              <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
                <Activity className="h-4 w-4 text-indigo-600" />
                <p className="text-sm font-semibold text-slate-900">Recent activity</p>
              </div>
              <div className="max-h-[340px] overflow-y-auto">
                {activity === null ? (
                  <div className="space-y-3 p-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="flex gap-3">
                        <Skeleton className="h-8 w-8 rounded-full" />
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="h-3 w-full" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : activity.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-slate-400">
                    No activity yet
                  </p>
                ) : (
                  activity.map((a) => (
                    <div key={a.id} className="flex gap-3 border-b border-slate-50 px-4 py-2.5 last:border-0">
                      <span
                        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm"
                        style={{ backgroundColor: `${a.actorColor ?? "#64748b"}18` }}
                      >
                        {actionIcon(a.action)}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[12.5px] leading-snug text-slate-700">{a.summary}</p>
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          {a.actorName ? `${a.actorName} · ` : ""}
                          {relativeTime(a.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <Dropdown
          trigger={
            <button className="flex items-center gap-2 rounded-xl py-1.5 pl-1.5 pr-2 transition-colors hover:bg-slate-100">
              <Avatar name={user.name} color={user.avatarColor} size={32} />
              <span className="hidden text-left sm:block">
                <span className="block text-[13px] font-semibold leading-tight text-slate-800">
                  {user.name}
                </span>
                <span className="block text-[11px] capitalize leading-tight text-slate-400">
                  {user.role}
                </span>
              </span>
            </button>
          }
          items={[
            {
              label: "My profile",
              icon: <UserRound className="h-4 w-4" />,
              onClick: () => router.push("/dashboard/settings"),
            },
            {
              label: "Settings",
              icon: <Settings className="h-4 w-4" />,
              onClick: () => router.push("/dashboard/settings"),
            },
            {
              label: signingOut ? "Signing out…" : "Sign out",
              icon: <LogOut className="h-4 w-4" />,
              onClick: signOut,
              danger: true,
            },
          ]}
        />
      </div>
    </header>
  );
}

export function TabLink({ active, href, children }: { active: boolean; href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className={cn(
        "rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
        active ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-100"
      )}
    >
      {children}
    </a>
  );
}
