import "server-only";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { orderItems } from "@/db/schema";
import { eq } from "drizzle-orm";
import type {
  CustomerRow,
  OrderRow,
  OrderDetailRow,
  InvoiceRow,
  InvoiceDetail,
  TaskRow,
  TeamMemberRow,
  TeamRow,
  ActivityRow,
  Product,
} from "@/lib/dto";

async function queryRows<T>(q: ReturnType<typeof sql>): Promise<T[]> {
  const result = (await db.execute(q)) as unknown as { rows: T[] };
  return result.rows;
}

// ---- Products ----
export async function listProducts(): Promise<Product[]> {
  return queryRows<Product>(
    sql`SELECT * FROM products ORDER BY created_at DESC`
  );
}

// ---- Customers ----
export async function listCustomers(): Promise<CustomerRow[]> {
  const rows = await queryRows<any>(sql`
    SELECT c.*,
      u.name AS owner_name,
      u.avatar_color AS owner_color,
      (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id)::int AS order_count,
      (SELECT COALESCE(SUM(total), 0) FROM orders o
        WHERE o.customer_id = c.id AND o.status <> 'cancelled')::bigint AS lifetime_value
    FROM customers c
    LEFT JOIN users u ON u.id = c.owner_id
    ORDER BY c.created_at DESC
  `);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    company: r.company,
    email: r.email,
    phone: r.phone,
    city: r.city,
    country: r.country,
    status: r.status,
    ownerId: r.owner_id,
    notes: r.notes,
    createdAt: r.created_at,
    ownerName: r.owner_name,
    ownerColor: r.owner_color,
    orderCount: Number(r.order_count),
    lifetimeValue: Number(r.lifetime_value),
  }));
}

// ---- Orders ----
const ORDER_SELECT = sql`
  SELECT o.*,
    c.name AS customer_name,
    c.company AS customer_company,
    c.email AS customer_email,
    c.phone AS customer_phone,
    u.name AS seller_name,
    u.avatar_color AS seller_color,
    (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id)::int AS item_count
  FROM orders o
  JOIN customers c ON c.id = o.customer_id
  LEFT JOIN users u ON u.id = o.seller_id
`;

function mapOrder(r: any): OrderRow {
  return {
    id: r.id,
    orderNumber: r.order_number,
    customerId: r.customer_id,
    sellerId: r.seller_id,
    status: r.status,
    subtotal: Number(r.subtotal),
    tax: Number(r.tax),
    total: Number(r.total),
    shippingAddress: r.shipping_address,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    customerName: r.customer_name,
    customerCompany: r.customer_company,
    sellerName: r.seller_name,
    sellerColor: r.seller_color,
    itemCount: Number(r.item_count),
  };
}

export async function listOrders(): Promise<OrderRow[]> {
  const rows = await queryRows<any>(
    sql`${ORDER_SELECT} ORDER BY o.created_at DESC`
  );
  return rows.map(mapOrder);
}

export async function getOrderDetail(id: string): Promise<OrderDetailRow | null> {
  const rows = await queryRows<any>(
    sql`${ORDER_SELECT} WHERE o.id = ${id}`
  );
  if (!rows.length) return null;
  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, id))
    .orderBy(orderItems.id);
  const base = mapOrder(rows[0]);
  return {
    ...base,
    items: items.map((it) => ({
      ...it,
      unitPrice: Number(it.unitPrice),
      lineTotal: Number(it.lineTotal),
    })),
    customerEmail: rows[0].customer_email ?? null,
    customerPhone: rows[0].customer_phone ?? null,
    customerAddress: rows[0].shipping_address ?? null,
  };
}

// ---- Invoices ----
export async function listInvoices(): Promise<InvoiceRow[]> {
  const rows = await queryRows<any>(sql`
    SELECT i.*,
      c.name AS customer_name,
      c.company AS customer_company,
      u.name AS seller_name,
      u.avatar_color AS seller_color,
      o.order_number AS order_number
    FROM invoices i
    JOIN customers c ON c.id = i.customer_id
    JOIN orders o ON o.id = i.order_id
    LEFT JOIN users u ON u.id = i.seller_id
    ORDER BY i.created_at DESC
  `);
  return rows.map((r) => ({
    id: r.id,
    invoiceNumber: r.invoice_number,
    orderId: r.order_id,
    customerId: r.customer_id,
    sellerId: r.seller_id,
    amount: Number(r.amount),
    tax: Number(r.tax),
    status: r.status,
    issuedAt: r.issued_at,
    dueDate: r.due_date,
    paidAt: r.paid_at,
    createdAt: r.created_at,
    customerName: r.customer_name,
    customerCompany: r.customer_company,
    sellerName: r.seller_name,
    sellerColor: r.seller_color,
    orderNumber: r.order_number,
  }));
}

export async function getInvoiceDetail(
  id: string
): Promise<InvoiceDetail | null> {
  const rows = await queryRows<any>(sql`
    SELECT i.*,
      c.name AS customer_name,
      c.company AS customer_company,
      c.email AS customer_email,
      u.name AS seller_name,
      u.avatar_color AS seller_color,
      o.order_number AS order_number,
      o.shipping_address AS shipping_address,
      o.notes AS notes
    FROM invoices i
    JOIN customers c ON c.id = i.customer_id
    JOIN orders o ON o.id = i.order_id
    LEFT JOIN users u ON u.id = i.seller_id
    WHERE i.id = ${id}
  `);
  if (!rows.length) return null;
  const r = rows[0];
  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, r.order_id));
  return {
    id: r.id,
    invoiceNumber: r.invoice_number,
    orderId: r.order_id,
    customerId: r.customer_id,
    sellerId: r.seller_id,
    amount: Number(r.amount),
    tax: Number(r.tax),
    status: r.status,
    issuedAt: r.issued_at,
    dueDate: r.due_date,
    paidAt: r.paid_at,
    createdAt: r.created_at,
    customerName: r.customer_name,
    customerCompany: r.customer_company,
    sellerName: r.seller_name,
    sellerColor: r.seller_color,
    orderNumber: r.order_number,
    customerEmail: r.customer_email,
    customerAddress: r.shipping_address,
    notes: r.notes,
    items: items.map((it) => ({
      ...it,
      unitPrice: Number(it.unitPrice),
      lineTotal: Number(it.lineTotal),
    })),
  };
}

// ---- Tasks ----
export async function listTasks(): Promise<TaskRow[]> {
  const rows = await queryRows<any>(sql`
    SELECT t.*,
      a.name AS assignee_name,
      a.avatar_color AS assignee_color,
      cr.name AS creator_name
    FROM tasks t
    LEFT JOIN users a ON a.id = t.assignee_id
    LEFT JOIN users cr ON cr.id = t.creator_id
    ORDER BY t.created_at DESC
  `);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,
    priority: r.priority,
    assigneeId: r.assignee_id,
    creatorId: r.creator_id,
    dueDate: r.due_date,
    completedAt: r.completed_at,
    createdAt: r.created_at,
    assigneeName: r.assignee_name,
    assigneeColor: r.assignee_color,
    creatorName: r.creator_name,
  }));
}

// ---- Team ----
export async function listTeamMembers(): Promise<TeamMemberRow[]> {
  const rows = await queryRows<any>(sql`
    SELECT u.*,
      (SELECT COUNT(*) FROM orders o WHERE o.seller_id = u.id)::int AS order_count,
      (SELECT COUNT(*) FROM customers c WHERE c.owner_id = u.id)::int AS customer_count,
      (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id = u.id AND t.status <> 'done')::int AS open_tasks,
      COALESCE(ARRAY_AGG(tm.team_id), ARRAY[]::uuid[]) AS team_ids
    FROM users u
    LEFT JOIN team_members tm ON tm.user_id = u.id
    GROUP BY u.id
    ORDER BY u.created_at
  `);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    title: r.title,
    department: r.department,
    phone: r.phone,
    avatarColor: r.avatar_color,
    status: r.status,
    createdAt: r.created_at,
    orderCount: Number(r.order_count),
    customerCount: Number(r.customer_count),
    openTasks: Number(r.open_tasks),
    teamIds: r.team_ids ?? [],
  }));
}

export async function listTeams(): Promise<TeamRow[]> {
  const rows = await queryRows<any>(sql`
    SELECT t.*, u.name AS lead_name,
      (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id)::int AS member_count
    FROM teams t
    LEFT JOIN users u ON u.id = t.lead_id
    ORDER BY t.created_at
  `);
  const memberRows = await queryRows<any>(sql`
    SELECT tm.team_id, u.id, u.name, u.title, u.role, u.avatar_color
    FROM team_members tm JOIN users u ON u.id = tm.user_id
    ORDER BY u.name
  `);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    leadId: r.lead_id,
    createdAt: r.created_at,
    leadName: r.lead_name,
    memberCount: Number(r.member_count),
    members: memberRows
      .filter((m) => m.team_id === r.id)
      .map((m) => ({
        id: m.id,
        name: m.name,
        title: m.title,
        role: m.role,
        avatarColor: m.avatar_color,
      })),
  }));
}

// ---- Activities ----
export async function listActivities(limit = 30): Promise<ActivityRow[]> {
  const rows = await queryRows<any>(sql`
    SELECT a.*, u.avatar_color AS actor_color
    FROM activities a
    LEFT JOIN users u ON u.id = a.actor_id
    ORDER BY a.created_at DESC
    LIMIT ${limit}
  `);
  return rows.map((r) => ({
    id: r.id,
    actorId: r.actor_id,
    actorName: r.actor_name,
    action: r.action,
    targetType: r.target_type,
    summary: r.summary,
    createdAt: r.created_at,
    actorColor: r.actor_color,
  }));
}
