import "server-only";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import {
  orders,
  customers,
  products,
  users,
  activities,
  orderStatusEnum,
} from "@/db/schema";
import { eq, desc } from "drizzle-orm";

const ORDER_STATUSES = orderStatusEnum.enumValues;

function num(v: unknown) {
  return Number(v ?? 0);
}

export interface MonthPoint {
  label: string;
  revenue: number;
  orders: number;
}

export interface MetricsPayload {
  revenue: number;
  revenuePrev: number;
  revenue30: number;
  orders30: number;
  ordersPrev30: number;
  customersTotal: number;
  customers30: number;
  activeProducts: number;
  lowStockCount: number;
  openTasks: number;
  overdueTasks: number;
  outstanding: number;
  overdueInvoices: number;
  series: MonthPoint[];
  statusBreakdown: Array<{ status: string; count: number }>;
  topProducts: Array<{
    id: string;
    name: string;
    icon: string;
    qty: number;
    revenue: number;
  }>;
  salesBySeller: Array<{
    id: string;
    name: string;
    color: string;
    orders: number;
    revenue: number;
  }>;
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    total: number;
    createdAt: Date;
    customerName: string;
    company: string | null;
    sellerName: string | null;
    sellerColor: string | null;
    itemCount: number;
  }>;
  lowStock: Array<{
    id: string;
    name: string;
    sku: string;
    icon: string;
    stock: number;
    reorderLevel: number;
  }>;
  recentActivity: Array<{
    id: string;
    action: string;
    targetType: string | null;
    summary: string;
    actorName: string | null;
    createdAt: Date;
  }>;
}

export async function getMetrics(): Promise<MetricsPayload> {
  const kpiSql = await db.execute(sql`
    SELECT
      (SELECT COALESCE(SUM(total),0) FROM orders WHERE status IN ('delivered','shipped')) AS revenue,
      (SELECT COALESCE(SUM(total),0) FROM orders WHERE status <> 'cancelled' AND created_at >= now() - interval '30 days') AS revenue_30,
      (SELECT COALESCE(SUM(total),0) FROM orders WHERE status <> 'cancelled' AND created_at >= now() - interval '60 days' AND created_at < now() - interval '30 days') AS revenue_prev,
      (SELECT COUNT(*) FROM orders WHERE created_at >= now() - interval '30 days') AS orders_30,
      (SELECT COUNT(*) FROM orders WHERE created_at >= now() - interval '60 days' AND created_at < now() - interval '30 days') AS orders_prev,
      (SELECT COUNT(*) FROM customers) AS customers_total,
      (SELECT COUNT(*) FROM customers WHERE created_at >= now() - interval '30 days') AS customers_30,
      (SELECT COUNT(*) FROM products WHERE status = 'active') AS active_products,
      (SELECT COUNT(*) FROM products WHERE status = 'active' AND stock <= reorder_level) AS low_stock,
      (SELECT COUNT(*) FROM tasks WHERE status <> 'done') AS open_tasks,
      (SELECT COUNT(*) FROM tasks WHERE status <> 'done' AND due_date IS NOT NULL AND due_date < now()) AS overdue_tasks,
      (SELECT COALESCE(SUM(amount + tax),0) FROM invoices WHERE status IN ('sent','overdue')) AS outstanding,
      (SELECT COUNT(*) FROM invoices WHERE status = 'overdue') AS overdue_invoices
  `);
  const kpi = (kpiSql as unknown as { rows: Record<string, unknown>[] }).rows[0];

  // Monthly series (last 8 months, zero-filled)
  const monthRowsSql = await db.execute(sql`
    SELECT date_trunc('month', created_at) AS bucket,
           COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN total ELSE 0 END), 0) AS revenue,
           COUNT(*) AS orders
    FROM orders
    WHERE created_at >= date_trunc('month', now()) - interval '7 months'
    GROUP BY 1
    ORDER BY 1
  `);
  const monthRows = (monthRowsSql as unknown as {
    rows: Array<{ bucket: Date; revenue: string; orders: number }>;
  }).rows;
  const monthMap = new Map(
    monthRows.map((r) => [new Date(r.bucket).getMonth().toString(), r])
  );
  const series: MonthPoint[] = [];
  for (let i = 7; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i, 1);
    const row = monthMap.get(d.getMonth().toString());
    series.push({
      label: d.toLocaleDateString("en-US", { month: "short" }),
      revenue: num(row?.revenue),
      orders: num(row?.orders),
    });
  }

  // Status breakdown
  const statusSql = await db.execute(sql`
    SELECT status, COUNT(*)::int AS count FROM orders GROUP BY status
  `);
  const statusRows = (statusSql as unknown as {
    rows: Array<{ status: string; count: number }>;
  }).rows;
  const statusMap = new Map(statusRows.map((r) => [r.status, num(r.count)]));
  const statusBreakdown = ORDER_STATUSES.map((s) => ({
    status: s,
    count: statusMap.get(s) ?? 0,
  }));

  // Top products
  const topSql = await db.execute(sql`
    SELECT p.id, p.name, p.icon,
           COALESCE(SUM(oi.qty), 0)::int AS qty,
           COALESCE(SUM(oi.line_total), 0)::bigint AS revenue
    FROM products p
    LEFT JOIN order_items oi ON oi.product_id = p.id
    LEFT JOIN orders o ON o.id = oi.order_id AND o.status <> 'cancelled'
    GROUP BY p.id, p.name, p.icon
    ORDER BY qty DESC, revenue DESC
    LIMIT 5
  `);
  const topProducts = ((topSql as unknown as { rows: MetricsPayload["topProducts"] }).rows).map(
    (r) => ({ ...r, revenue: num(r.revenue) })
  );

  // Sales by seller
  const sellerSql = await db.execute(sql`
    SELECT u.id, u.name, u.avatar_color AS color,
           COUNT(o.id)::int AS orders,
           COALESCE(SUM(o.total), 0)::bigint AS revenue
    FROM users u
    LEFT JOIN orders o ON o.seller_id = u.id AND o.status <> 'cancelled'
    WHERE u.role <> 'admin' AND u.status = 'active'
    GROUP BY u.id, u.name, u.avatar_color
    ORDER BY revenue DESC
  `);
  const salesBySeller = ((sellerSql as unknown as { rows: MetricsPayload["salesBySeller"] }).rows).map(
    (r) => ({ ...r, revenue: num(r.revenue) })
  );

  const recentOrders = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      total: orders.total,
      createdAt: orders.createdAt,
      customerName: customers.name,
      company: customers.company,
      sellerName: users.name,
      sellerColor: users.avatarColor,
      itemCount: sql<number>`(SELECT COUNT(*)::int FROM order_items oi WHERE oi.order_id = ${orders.id})`,
    })
    .from(orders)
    .innerJoin(customers, eq(orders.customerId, customers.id))
    .leftJoin(users, eq(orders.sellerId, users.id))
    .orderBy(desc(orders.createdAt))
    .limit(7);

  const lowStock = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      icon: products.icon,
      stock: products.stock,
      reorderLevel: products.reorderLevel,
    })
    .from(products)
    .where(
      sql`${products.status} = 'active' AND ${products.stock} <= ${products.reorderLevel}`
    )
    .orderBy(products.stock)
    .limit(8);

  const recentActivity = await db
    .select({
      id: activities.id,
      action: activities.action,
      targetType: activities.targetType,
      summary: activities.summary,
      actorName: activities.actorName,
      createdAt: activities.createdAt,
    })
    .from(activities)
    .orderBy(desc(activities.createdAt))
    .limit(8);

  return {
    revenue: num(kpi.revenue),
    revenuePrev: num(kpi.revenue_prev),
    revenue30: num(kpi.revenue_30),
    orders30: num(kpi.orders_30),
    ordersPrev30: num(kpi.orders_prev),
    customersTotal: num(kpi.customers_total),
    customers30: num(kpi.customers_30),
    activeProducts: num(kpi.active_products),
    lowStockCount: num(kpi.low_stock),
    openTasks: num(kpi.open_tasks),
    overdueTasks: num(kpi.overdue_tasks),
    outstanding: num(kpi.outstanding),
    overdueInvoices: num(kpi.overdue_invoices),
    series,
    statusBreakdown,
    topProducts,
    salesBySeller,
    recentOrders,
    lowStock,
    recentActivity,
  };
}
