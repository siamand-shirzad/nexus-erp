"use client";

import { useState } from "react";
import Link from "next/link";
import {
  DollarSign,
  ShoppingCart,
  ContactRound,
  AlarmClock,
  RefreshCw,
  FileDown,
  TrendingUp,
  TrendingDown,
  Package,
  AlertTriangle,
  ArrowRight,
  ShoppingBag,
  UserCog,
  ClipboardList,
} from "lucide-react";
import {
  Card,
  Button,
  Badge,
  IconBadge,
  Skeleton,
  orderStatusTone,
} from "@/components/ui";
import { AreaChart, DonutChart, Meter } from "@/components/charts";
import { apiFetch } from "@/lib/client";
import { exportReportPdf } from "@/lib/pdf";
import {
  formatCurrency,
  formatNumber,
  formatDate,
  relativeTime,
  titleCase,
  initials,
} from "@/lib/utils";
import type { MetricsPayload } from "@/lib/metrics";

const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b",
  processing: "#7c3aed",
  shipped: "#0284c7",
  delivered: "#16a34a",
  cancelled: "#94a3b8",
};

function deltaPct(current: number, previous: number) {
  if (!previous) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

const actionEmoji: Record<string, string> = {
  order: "🛒",
  invoice: "🧾",
  customer: "👤",
  product: "📦",
  task: "✅",
  team: "👥",
  report: "📄",
};

export function DashboardView({ initial }: { initial: MetricsPayload }) {
  const [m, setM] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      setM(await apiFetch<MetricsPayload>("/api/metrics"));
    } finally {
      setRefreshing(false);
    }
  }

  function exportOverview() {
    exportReportPdf({
      filename: `nexus-overview-${new Date().toISOString().slice(0, 10)}.pdf`,
      title: "Business Overview Report",
      subtitle: `Generated ${new Date().toLocaleString("en-US")} · Nexus ERP`,
      summary: [
        { label: "Total revenue", value: formatCurrency(m.revenue) },
        { label: "Outstanding", value: formatCurrency(m.outstanding) },
        { label: "Customers", value: formatNumber(m.customersTotal) },
        { label: "Open tasks", value: formatNumber(m.openTasks) },
      ],
      columns: ["Month", "Revenue", "Orders"],
      rows: m.series.map((s) => [s.label, formatCurrency(s.revenue), String(s.orders)]),
      totals: [
        "Total",
        formatCurrency(m.series.reduce((s, x) => s + x.revenue, 0)),
        String(m.series.reduce((s, x) => s + x.orders, 0)),
      ],
    });
  }

  const orderDelta = deltaPct(m.orders30, m.ordersPrev30);
  const revenueDelta = deltaPct(m.revenue30, m.revenuePrev);
  const allOrders = m.statusBreakdown.reduce((s, x) => s + x.count, 0);
  const maxSeller = Math.max(...m.salesBySeller.map((s) => s.revenue), 1);
  const maxProduct = Math.max(...m.topProducts.map((p) => p.qty), 1);

  const kpis = [
    {
      label: "Total revenue",
      value: formatCurrency(m.revenue),
      icon: <DollarSign className="h-5 w-5" />,
      tone: "emerald" as const,
      delta: revenueDelta,
      sub: "vs previous 30 days",
    },
    {
      label: "Orders · 30d",
      value: formatNumber(m.orders30),
      icon: <ShoppingCart className="h-5 w-5" />,
      tone: "indigo" as const,
      delta: orderDelta,
      sub: `${formatNumber(allOrders)} all-time`,
    },
    {
      label: "Customers",
      value: formatNumber(m.customersTotal),
      icon: <ContactRound className="h-5 w-5" />,
      tone: "violet" as const,
      delta: null,
      sub: `+${m.customers30} new in 30 days`,
    },
    {
      label: "Outstanding",
      value: formatCurrency(m.outstanding),
      icon: <AlarmClock className="h-5 w-5" />,
      tone: m.overdueInvoices ? ("red" as const) : ("sky" as const),
      delta: null,
      sub: `${m.overdueInvoices} overdue invoice${m.overdueInvoices === 1 ? "" : "s"}`,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}{" "}
            · {m.lowStockCount} product{m.lowStockCount === 1 ? "" : "s"} below reorder level
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="md" onClick={refresh} loading={refreshing}>
            {!refreshing && <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
          <Button onClick={exportOverview}>
            <FileDown className="h-4 w-4" />
            Export report
          </Button>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="p-5 transition-shadow hover:shadow-md">
            <div className="flex items-start justify-between">
              <IconBadge tone={k.tone}>{k.icon}</IconBadge>
              {k.delta !== null && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    k.delta >= 0
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-red-50 text-red-700"
                  }`}
                >
                  {k.delta >= 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {Math.abs(k.delta)}%
                </span>
              )}
            </div>
            <p className="mt-4 text-2xl font-bold tracking-tight text-slate-900 tnum">
              {k.value}
            </p>
            <p className="mt-0.5 text-[13px] font-medium text-slate-600">{k.label}</p>
            <p className="mt-0.5 text-xs text-slate-400">{k.sub}</p>
          </Card>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Revenue trend</h3>
              <p className="text-xs text-slate-400">Last 8 months · gross order value</p>
            </div>
            <Badge tone="indigo" dot>
              Monthly
            </Badge>
          </div>
          {refreshing ? (
            <Skeleton className="h-[240px] w-full" />
          ) : (
            <AreaChart data={m.series} />
          )}
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold text-slate-900">Orders by status</h3>
          <p className="text-xs text-slate-400">Current pipeline distribution</p>
          <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row sm:justify-around">
            <DonutChart
              data={m.statusBreakdown.map((s) => ({
                label: titleCase(s.status),
                value: s.count,
                color: STATUS_COLORS[s.status] ?? "#94a3b8",
              }))}
              centerLabel="orders"
            />
            <div className="w-full space-y-2 sm:w-auto">
              {m.statusBreakdown.map((s) => (
                <div key={s.status} className="flex items-center gap-2.5 text-[13px]">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: STATUS_COLORS[s.status] }}
                  />
                  <span className="flex-1 text-slate-600">{titleCase(s.status)}</span>
                  <span className="font-semibold text-slate-900 tnum">{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Recent orders + side columns */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="overflow-hidden xl:col-span-2">
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Recent orders</h3>
              <p className="text-xs text-slate-400">Latest activity across the pipeline</p>
            </div>
            <Link
              href="/dashboard/orders"
              className="inline-flex items-center gap-1 text-[13px] font-medium text-indigo-600 hover:text-indigo-500"
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-slate-100 bg-slate-50/60 text-left text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="px-5 py-2.5 font-semibold">Order</th>
                  <th className="px-3 py-2.5 font-semibold">Customer</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Total</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {refreshing && !m.recentOrders.length
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={5} className="px-5 py-3">
                          <Skeleton className="h-4 w-full" />
                        </td>
                      </tr>
                    ))
                  : m.recentOrders.map((o) => (
                      <tr key={o.id} className="group transition-colors hover:bg-slate-50/70">
                        <td className="px-5 py-3">
                          <Link
                            href={`/dashboard/orders/${o.id}`}
                            className="font-semibold text-indigo-600 group-hover:underline"
                          >
                            {o.orderNumber}
                          </Link>
                          <p className="text-[11px] text-slate-400">{o.itemCount} item{o.itemCount === 1 ? "" : "s"}</p>
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-medium text-slate-800">{o.company ?? o.customerName}</p>
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                            {o.sellerColor && (
                              <span
                                className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold text-white"
                                style={{ backgroundColor: o.sellerColor }}
                              >
                                {initials(o.sellerName ?? "?")}
                              </span>
                            )}
                            {o.sellerName}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <Badge tone={orderStatusTone[o.status]} dot>
                            {titleCase(o.status)}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 text-right font-semibold text-slate-900 tnum">
                          {o.status === "cancelled" ? "—" : formatCurrency(o.total)}
                        </td>
                        <td className="px-5 py-3 text-right text-[13px] text-slate-500 tnum">
                          {formatDate(o.createdAt)}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-6">
          {/* Low stock */}
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <IconBadge tone={m.lowStock.length ? "red" : "emerald"} size={34}>
                  <AlertTriangle className="h-4.5 w-4.5" />
                </IconBadge>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Inventory alerts</h3>
                  <p className="text-xs text-slate-400">At or below reorder level</p>
                </div>
              </div>
              <Link href="/dashboard/products" className="text-[13px] font-medium text-indigo-600 hover:text-indigo-500">
                Manage
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {m.lowStock.length === 0 && (
                <p className="rounded-xl bg-emerald-50 px-3 py-2.5 text-[13px] font-medium text-emerald-700">
                  All stock levels healthy ✓
                </p>
              )}
              {m.lowStock.map((p) => {
                const out = p.stock === 0;
                return (
                  <div key={p.id} className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-lg">
                      {p.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-slate-800">{p.name}</p>
                      <p className="text-[11px] text-slate-400">{p.sku}</p>
                    </div>
                    <Badge tone={out ? "red" : "amber"}>
                      {out ? "Out of stock" : `${p.stock} left`}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Activity */}
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <IconBadge tone="indigo" size={34}>
                <ClipboardList className="h-4.5 w-4.5" />
              </IconBadge>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Activity feed</h3>
                <p className="text-xs text-slate-400">Latest team actions</p>
              </div>
            </div>
            <div className="mt-4 space-y-0">
              {m.recentActivity.map((a, i) => (
                <div key={a.id} className="relative flex gap-3 pb-4 last:pb-0">
                  {i < m.recentActivity.length - 1 && (
                    <span className="absolute left-[15px] top-8 h-[calc(100%-20px)] w-px bg-slate-100" />
                  )}
                  <span className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm ring-4 ring-white">
                    {actionEmoji[a.targetType ?? ""] ?? "•"}
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-[12.5px] leading-snug text-slate-700">{a.summary}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {a.actorName ?? "System"} · {relativeTime(a.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <IconBadge tone="amber" size={34}>
              <Package className="h-4.5 w-4.5" />
            </IconBadge>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Top products</h3>
              <p className="text-xs text-slate-400">Best sellers by units moved</p>
            </div>
          </div>
          <div className="space-y-4">
            {m.topProducts.map((p) => (
              <div key={p.id} className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-lg">
                  {p.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[13px] font-semibold text-slate-800">{p.name}</p>
                    <p className="text-[13px] font-bold text-slate-900 tnum">{formatCurrency(p.revenue, { compact: true })}</p>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2.5">
                    <Meter value={p.qty} max={maxProduct} color="#f59e0b" />
                    <span className="w-16 shrink-0 text-right text-[11px] text-slate-400 tnum">
                      {p.qty} units
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <IconBadge tone="teal" size={34}>
              <UserCog className="h-4.5 w-4.5" />
            </IconBadge>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Sales by rep</h3>
              <p className="text-xs text-slate-400">Recognized revenue per team member</p>
            </div>
          </div>
          <div className="space-y-4">
            {m.salesBySeller.map((s) => (
              <div key={s.id} className="flex items-center gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                  style={{ backgroundColor: s.color }}
                >
                  {initials(s.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[13px] font-semibold text-slate-800">{s.name}</p>
                    <p className="text-[13px] font-bold text-slate-900 tnum">{formatCurrency(s.revenue, { compact: true })}</p>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2.5">
                    <Meter value={s.revenue} max={maxSeller} color={s.color} />
                    <span className="w-16 shrink-0 text-right text-[11px] text-slate-400 tnum">
                      {s.orders} orders
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-[12px] text-slate-500">
            <ShoppingBag className="h-3.5 w-3.5" />
            {m.openTasks} open tasks · {m.overdueTasks} overdue
            <Link href="/dashboard/tasks" className="ml-auto font-semibold text-indigo-600 hover:underline">
              Board →
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}


