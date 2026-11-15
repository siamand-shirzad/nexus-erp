"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Receipt,
  Package,
  ContactRound,
  UserCog,
  ListTodo,
  Settings,
  X,
  Sparkles,
  Gauge,
  BookOpenText,
  Zap,
  ListTree,
  Users,
  Landmark,
  Scale,
  FileBarChart,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@/db/schema";
import { Avatar } from "@/components/ui";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  roles?: Role[];
  exact?: boolean;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    title: "Accounting",
    items: [
      { href: "/accounting", label: "Dashboard", icon: <Gauge className="h-[18px] w-[18px]" />, roles: ["admin"], exact: true },
      { href: "/accounting/journal", label: "Journal Entries", icon: <BookOpenText className="h-[18px] w-[18px]" />, roles: ["admin"] },
      { href: "/accounting/quick", label: "Quick Transactions", icon: <Zap className="h-[18px] w-[18px]" />, roles: ["admin"] },
      { href: "/accounting/accounts", label: "Chart of Accounts", icon: <ListTree className="h-[18px] w-[18px]" />, roles: ["admin"] },
      { href: "/accounting/parties", label: "Parties", icon: <Users className="h-[18px] w-[18px]" />, roles: ["admin"] },
      { href: "/accounting/bank", label: "Bank & Cash", icon: <Landmark className="h-[18px] w-[18px]" />, roles: ["admin"] },
      { href: "/accounting/reconciliation", label: "Reconciliation", icon: <Scale className="h-[18px] w-[18px]" />, roles: ["admin"] },
      { href: "/accounting/reports", label: "Reports", icon: <FileBarChart className="h-[18px] w-[18px]" />, roles: ["admin"] },
      { href: "/accounting/settings", label: "Settings", icon: <SlidersHorizontal className="h-[18px] w-[18px]" />, roles: ["admin"] },
    ],
  },
  {
    title: "Sales",
    items: [
      { href: "/dashboard", label: "Sales Overview", icon: <LayoutDashboard className="h-[18px] w-[18px]" />, exact: true },
      { href: "/dashboard/orders", label: "Orders", icon: <ShoppingCart className="h-[18px] w-[18px]" /> },
      { href: "/dashboard/invoices", label: "Invoices", icon: <Receipt className="h-[18px] w-[18px]" /> },
      { href: "/dashboard/customers", label: "Customers", icon: <ContactRound className="h-[18px] w-[18px]" /> },
    ],
  },
  {
    title: "Operations",
    items: [
      { href: "/dashboard/products", label: "Products", icon: <Package className="h-[18px] w-[18px]" /> },
      { href: "/dashboard/tasks", label: "Tasks", icon: <ListTodo className="h-[18px] w-[18px]" /> },
      {
        href: "/dashboard/team",
        label: "Team",
        icon: <UserCog className="h-[18px] w-[18px]" />,
        roles: ["admin", "manager"],
      },
    ],
  },
  {
    title: "Account",
    items: [
      { href: "/dashboard/settings", label: "Profile", icon: <Settings className="h-[18px] w-[18px]" /> },
    ],
  },
];

export function SidebarContent({
  role,
  onNavigate,
}: {
  role: Role;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-300">
      <div className="flex items-center gap-2.5 px-5 pb-5 pt-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-base font-bold text-white shadow-lg shadow-indigo-950/60">
          N
        </span>
        <div className="leading-tight">
          <p className="text-[15px] font-semibold text-white">Nexus ERP</p>
          <p className="text-[11px] text-slate-400">Operations Suite</p>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4 no-scrollbar">
        {NAV.map((group) => {
          const items = group.items.filter((i) => !i.roles || i.roles.includes(role));
          if (!items.length) return null;
          return (
            <div key={group.title}>
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                {group.title}
              </p>
              <div className="space-y-0.5">
                {items.map((item) => {
                  const active =
                    pathname === item.href || (!item.exact && pathname.startsWith(item.href + "/"));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-all duration-150",
                        active
                          ? "bg-indigo-600 text-white shadow-md shadow-indigo-950/40"
                          : "text-slate-400 hover:bg-white/5 hover:text-white"
                      )}
                    >
                      <span
                        className={cn(
                          "transition-colors",
                          active ? "text-white" : "text-slate-500 group-hover:text-slate-300"
                        )}
                      >
                        {item.icon}
                      </span>
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="mx-3 mb-4 rounded-2xl bg-gradient-to-br from-indigo-600/90 to-violet-700/90 p-4">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-white">
          <Sparkles className="h-4 w-4" />
          Export-ready
        </div>
        <p className="mt-1 text-[11.5px] leading-relaxed text-indigo-100">
          Reports export to Excel and print cleanly to PDF.
        </p>
      </div>
    </div>
  );
}

export function Sidebar({ role }: { role: Role }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-800 lg:block print:!hidden">
      <SidebarContent role={role} />
    </aside>
  );
}

export function MobileSidebar({
  open,
  onClose,
  role,
}: {
  open: boolean;
  onClose: () => void;
  role: Role;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <aside className="absolute inset-y-0 left-0 w-72 animate-slide-up">
        <button
          onClick={onClose}
          className="absolute right-3 top-4 z-10 rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
        <SidebarContent role={role} onNavigate={onClose} />
      </aside>
    </div>
  );
}

export function UserMini({
  name,
  title,
  color,
}: {
  name: string;
  title: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <Avatar name={name} color={color} size={34} />
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[13px] font-semibold text-white">{name}</p>
        <p className="truncate text-[11px] text-slate-400">{title}</p>
      </div>
    </div>
  );
}
