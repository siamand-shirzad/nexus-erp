import { db } from "@/db";
import { sql } from "drizzle-orm";
import {
  users,
  teams,
  teamMembers,
  products,
  customers,
  orders,
  orderItems,
  invoices,
  tasks,
  activities,
  type User,
  type Product,
  type Customer,
  type Order,
  type Invoice,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth";

// Deterministic PRNG so demo data stays consistent
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(20260217);
const pick = <T,>(arr: T[]) => arr[Math.floor(rng() * arr.length)];
const pickN = <T,>(arr: T[], n: number) => {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < n && copy.length) {
    out.push(copy.splice(Math.floor(rng() * copy.length), 1)[0]);
  }
  return out;
};
const int = (min: number, max: number) =>
  Math.floor(rng() * (max - min + 1)) + min;

function daysAgo(n: number, hour?: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  if (hour !== undefined) d.setHours(hour, int(0, 59), 0, 0);
  else d.setHours(int(7, 19), int(0, 59), 0, 0);
  return d;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

const AVATAR_COLORS = [
  "#4f46e5",
  "#0d9488",
  "#d946ef",
  "#f59e0b",
  "#ef4444",
  "#0ea5e9",
  "#8b5cf6",
  "#16a34a",
];

interface SeedUser extends User {
  password: string;
}

const SEED_USERS: Array<Partial<SeedUser> & { name: string; email: string; role: User["role"]; title: string; department: string }> = [
  {
    name: "Ava Mitchell",
    email: "admin@nexus.io",
    role: "admin",
    title: "Operations Administrator",
    department: "Operations",
    avatarColor: "#4f46e5",
    phone: "+1 (415) 555-0101",
  },
  {
    name: "Daniel Ruiz",
    email: "daniel@nexus.io",
    role: "manager",
    title: "Sales Manager",
    department: "Sales",
    avatarColor: "#0d9488",
    phone: "+1 (415) 555-0102",
  },
  {
    name: "Maya Chen",
    email: "maya@nexus.io",
    role: "seller",
    title: "Senior Account Executive",
    department: "Sales",
    avatarColor: "#d946ef",
    phone: "+1 (415) 555-0103",
  },
  {
    name: "Jordan Patel",
    email: "jordan@nexus.io",
    role: "seller",
    title: "Account Executive",
    department: "Sales",
    avatarColor: "#f59e0b",
    phone: "+1 (415) 555-0104",
  },
  {
    name: "Sofia Romano",
    email: "sofia@nexus.io",
    role: "seller",
    title: "Account Executive",
    department: "Sales",
    avatarColor: "#ef4444",
    phone: "+1 (415) 555-0105",
  },
  {
    name: "Liam O'Connor",
    email: "liam@nexus.io",
    role: "seller",
    title: "Customer Success Representative",
    department: "Customer Success",
    avatarColor: "#0ea5e9",
    phone: "+1 (415) 555-0106",
  },
];

const SEED_PRODUCTS: Array<{
  name: string;
  sku: string;
  category: string;
  icon: string;
  price: number;
  cost: number;
  reorder: number;
  description: string;
}> = [
  { name: "Aurora Wireless Headset", sku: "AUD-1001", category: "Audio", icon: "🎧", price: 12900, cost: 6200, reorder: 12, description: "Noise-cancelling over-ear headset with 40h battery life." },
  { name: "Pulse Bluetooth Speaker", sku: "AUD-1002", category: "Audio", icon: "🔊", price: 8900, cost: 4100, reorder: 15, description: "Portable IP67 speaker with 360° sound and deep bass." },
  { name: "Studio Pro Microphone", sku: "AUD-1003", category: "Audio", icon: "🎙️", price: 19900, cost: 9800, reorder: 8, description: "USB condenser microphone for streaming and podcasts." },
  { name: "Nimbus 27\" 4K Monitor", sku: "DSP-2001", category: "Displays", icon: "🖥️", price: 32900, cost: 19800, reorder: 6, description: "UHD IPS panel with 99% sRGB and USB-C 90W." },
  { name: "Vista 34\" Ultrawide Display", sku: "DSP-2002", category: "Displays", icon: "🖼️", price: 54900, cost: 34200, reorder: 4, description: "Curved 3440x1440 ultrawide with KVM switch." },
  { name: "Slate Mechanical Keyboard", sku: "ACC-3001", category: "Accessories", icon: "⌨️", price: 10900, cost: 4800, reorder: 20, description: "Hot-swappable tactile switches, aluminum frame." },
  { name: "Glide Wireless Mouse", sku: "ACC-3002", category: "Accessories", icon: "🖱️", price: 5900, cost: 2200, reorder: 25, description: "Ergonomic silent mouse with precision sensor." },
  { name: "Hub 9-in-1 Docking Station", sku: "ACC-3003", category: "Accessories", icon: "🔌", price: 14900, cost: 7100, reorder: 10, description: "HDMI, Ethernet, SD and 100W USB-C pass-through." },
  { name: "Volt 100W GaN Charger", sku: "ACC-3004", category: "Accessories", icon: "🔋", price: 6900, cost: 2800, reorder: 18, description: "Four-port compact charger with fast charge." },
  { name: "Orbit 1080p Webcam", sku: "ACC-3005", category: "Accessories", icon: "📷", price: 7900, cost: 3300, reorder: 14, description: "Auto-framing webcam with dual microphones." },
  { name: "Nomad 15\" Laptop Sleeve", sku: "ACC-3006", category: "Accessories", icon: "💼", price: 3900, cost: 1400, reorder: 20, description: "Recycled felt sleeve with magnetic closure." },
  { name: "Flux Standing Desk Converter", sku: "FUR-4001", category: "Furniture", icon: "🪑", price: 27900, cost: 16800, reorder: 5, description: "Sit-stand riser with keyboard tray, holds 15kg." },
  { name: "Ergo Mesh Task Chair", sku: "FUR-4002", category: "Furniture", icon: "💺", price: 38900, cost: 23500, reorder: 5, description: "Lumbar support, 4D armrests, breathable mesh." },
  { name: "Hush Acoustic Desk Panel", sku: "FUR-4003", category: "Furniture", icon: "🧱", price: 8900, cost: 3600, reorder: 12, description: "Clip-on privacy panel reducing office noise." },
  { name: "Ledger Hardcover Notebook", sku: "OFF-5001", category: "Office", icon: "📓", price: 1900, cost: 600, reorder: 40, description: "A5 dotted notebook, 240 pages, lay-flat binding." },
  { name: "Scribe Gel Pen Set", sku: "OFF-5002", category: "Office", icon: "🖊️", price: 1500, cost: 400, reorder: 50, description: "Pack of 12 quick-dry gel pens." },
  { name: "Atlas Desk Organizer", sku: "OFF-5003", category: "Office", icon: "🗂️", price: 3500, cost: 1200, reorder: 22, description: "Bamboo organizer with five compartments." },
  { name: "Vault Shredder 12-Sheet", sku: "OFF-5004", category: "Office", icon: "🧾", price: 12900, cost: 6400, reorder: 8, description: "Cross-cut shredder with 18L pull-out bin." },
  { name: "Aegis WiFi 6 Router", sku: "NET-6001", category: "Networking", icon: "📡", price: 21900, cost: 12200, reorder: 7, description: "Tri-band mesh router covering 280 m²." },
  { name: "Aegis Mesh Satellite", sku: "NET-6002", category: "Networking", icon: "🛰️", price: 11900, cost: 6100, reorder: 10, description: "Add-on satellite extending mesh coverage." },
  { name: "Titan Cat6 Cable 10m", sku: "NET-6003", category: "Networking", icon: "🧵", price: 2200, cost: 700, reorder: 30, description: "Snagless RJ45 patch cable, 10 meters." },
  { name: "Vault NAS 4-Bay", sku: "STO-7001", category: "Storage", icon: "🗄️", price: 49900, cost: 31800, reorder: 3, description: "Quad-bay network storage with snapshot backups." },
  { name: "Core 2TB Portable SSD", sku: "STO-7002", category: "Storage", icon: "💽", price: 17900, cost: 9900, reorder: 12, description: "USB-C 1050 MB/s rugged solid-state drive." },
  { name: "Arc 128GB Flash Drive", sku: "STO-7003", category: "Storage", icon: "💾", price: 2400, cost: 900, reorder: 35, description: "Metal USB 3.2 drive with keyring loop." },
];

const SEED_CUSTOMERS: Array<{
  name: string;
  company: string;
  email: string;
  phone: string;
  city: string;
  status: Customer["status"];
}> = [
  { name: "Robert Hale", company: "Brightline Media", email: "r.hale@brightline.io", phone: "+1 (212) 555-0141", city: "New York, NY", status: "active" },
  { name: "Priya Nair", company: "Northwind Logistics", email: "priya@northwind.co", phone: "+1 (312) 555-0142", city: "Chicago, IL", status: "active" },
  { name: "Marcus Webb", company: "Webb & Associates", email: "marcus@webblaw.com", phone: "+1 (617) 555-0143", city: "Boston, MA", status: "active" },
  { name: "Elena Petrova", company: "Lumen Health", email: "elena.p@lumenhealth.com", phone: "+1 (206) 555-0144", city: "Seattle, WA", status: "active" },
  { name: "Tom Becker", company: "Becker Construction", email: "tom@beckerbuilds.com", phone: "+1 (503) 555-0145", city: "Portland, OR", status: "active" },
  { name: "Aisha Khan", company: "Khan Financial Group", email: "aisha@khanfg.com", phone: "+1 (404) 555-0146", city: "Atlanta, GA", status: "active" },
  { name: "Diego Morales", company: "Solstice Solar", email: "diego@solsticesolar.com", phone: "+1 (512) 555-0147", city: "Austin, TX", status: "active" },
  { name: "Hannah Brooks", company: "Brooks Interiors", email: "hannah@brooksinteriors.com", phone: "+1 (303) 555-0148", city: "Denver, CO", status: "active" },
  { name: "Kenji Watanabe", company: "Watanabe Robotics", email: "kenji@wrobotics.jp", phone: "+1 (408) 555-0149", city: "San Jose, CA", status: "active" },
  { name: "Olivia Grant", company: "Grant Education Services", email: "olivia@grantedu.org", phone: "+1 (612) 555-0150", city: "Minneapolis, MN", status: "active" },
  { name: "Samuel Adeyemi", company: "Adeyemi Imports", email: "sam@adeyemiimports.com", phone: "+1 (713) 555-0151", city: "Houston, TX", status: "active" },
  { name: "Grace Liu", company: "Jade Tea House", email: "grace@jadetea.com", phone: "+1 (415) 555-0152", city: "San Francisco, CA", status: "active" },
  { name: "Henry Novak", company: "Novak Auto Repair", email: "henry@novakauto.com", phone: "+1 (313) 555-0153", city: "Detroit, MI", status: "lead" },
  { name: "Isabel Costa", company: "Costa Travel Co.", email: "isabel@costatravel.com", phone: "+1 (305) 555-0154", city: "Miami, FL", status: "active" },
  { name: "Nathan Frost", company: "Frost Analytics", email: "nathan@frosta.io", phone: "+1 (617) 555-0155", city: "Cambridge, MA", status: "lead" },
  { name: "Rachel Kim", company: "Kim Dental Clinic", email: "rachel@kimdental.com", phone: "+1 (213) 555-0156", city: "Los Angeles, CA", status: "active" },
  { name: "Victor Almeida", company: "Almeida Foods", email: "victor@almeidafoods.com", phone: "+1 (602) 555-0157", city: "Phoenix, AZ", status: "churned" },
  { name: "Theresa Vogel", company: "Vogel Architecture", email: "theresa@vogelarch.com", phone: "+1 (314) 555-0158", city: "St. Louis, MO", status: "lead" },
];

const TASK_TITLES: Array<{ title: string; description: string; priority: "low" | "medium" | "high"; status: "todo" | "in_progress" | "done"; daysDue: number; assignee: number }> = [
  { title: "Follow up on Frost Analytics proposal", description: "Send revised quote for 12 workstations and docking stations.", priority: "high", status: "in_progress", daysDue: 1, assignee: 2 },
  { title: "Onboard Vogel Architecture account", description: "Schedule discovery call and prepare product catalog.", priority: "medium", status: "todo", daysDue: 3, assignee: 3 },
  { title: "Restock Aegis WiFi 6 routers", description: "Stock is below reorder level; place PO with supplier.", priority: "high", status: "in_progress", daysDue: 2, assignee: 0 },
  { title: "Quarterly business review — Lumen Health", description: "Prepare usage and savings report for Elena's team.", priority: "medium", status: "todo", daysDue: 7, assignee: 4 },
  { title: "Resolve invoice overdue: Almeida Foods", description: "Reach out to Victor and confirm payment schedule.", priority: "high", status: "in_progress", daysDue: 0, assignee: 5 },
  { title: "Demo: ultrawide monitors for Watanabe Robotics", description: "Ship demo unit and book walkthrough with Kenji.", priority: "medium", status: "todo", daysDue: 5, assignee: 2 },
  { title: "Update pricing sheets for Q3", description: "Reflect new cost changes across Audio line.", priority: "low", status: "done", daysDue: -4, assignee: 1 },
  { title: "Renew support contract — Khan Financial", description: "Contract renews end of month; send paperwork.", priority: "medium", status: "todo", daysDue: 12, assignee: 3 },
  { title: "Collect NPS feedback from 10 customers", description: "Send NPS survey and log responses in CRM.", priority: "low", status: "in_progress", daysDue: 9, assignee: 5 },
  { title: "Prepare sales enablement deck", description: "One-pagers for Networking and Storage bundles.", priority: "medium", status: "done", daysDue: -2, assignee: 1 },
  { title: "Credit check: Novak Auto Repair", description: "Run business credit check before extending terms.", priority: "medium", status: "todo", daysDue: 4, assignee: 4 },
  { title: "Warehouse inventory audit", description: "Full count of Accessories category, reconcile ERP.", priority: "high", status: "done", daysDue: -6, assignee: 0 },
  { title: "Train Liam on new invoicing flow", description: "Walk through partial shipments and credits.", priority: "low", status: "done", daysDue: -8, assignee: 1 },
  { title: "Draft March promotion bundle", description: "Chair + desk converter combo at 12% off.", priority: "medium", status: "todo", daysDue: 14, assignee: 1 },
];

const STREETS = ["120 Market Street", "480 Pine Avenue", "90 Lake Shore Dr", "27 Industrial Way", "5500 Commerce Blvd", "14 Harbor Point", "88 Cedar Lane"];

export async function resetAndSeed() {
  await db.execute(
    sql.raw(
      "TRUNCATE activities, tasks, invoices, order_items, orders, customers, products, team_members, teams, users RESTART IDENTITY CASCADE"
    )
  );

  const passwordHash = await hashPassword("demo1234");

  // ---- Users ----
  const userRows: User[] = [];
  for (let i = 0; i < SEED_USERS.length; i++) {
    const u = SEED_USERS[i];
    const [row] = await db
      .insert(users)
      .values({
        name: u.name,
        email: u.email,
        passwordHash,
        role: u.role,
        title: u.title,
        department: u.department,
        avatarColor: u.avatarColor ?? AVATAR_COLORS[i % AVATAR_COLORS.length],
        phone: u.phone,
        createdAt: daysAgo(120 - i * 12, 9),
      })
      .returning();
    userRows.push(row);
  }

  // ---- Teams ----
  const teamDefs = [
    { name: "Field Sales", description: "Outside account executives running enterprise deals.", lead: userRows[1], members: [1, 2, 4] },
    { name: "Inside Sales", description: "Inbound-qualified accounts and SMB renewals.", lead: userRows[3], members: [3] },
    { name: "Customer Success", description: "Onboarding, retention and support account management.", lead: userRows[5], members: [5] },
  ];
  for (const t of teamDefs) {
    const [team] = await db
      .insert(teams)
      .values({
        name: t.name,
        description: t.description,
        leadId: t.lead.id,
        createdAt: daysAgo(118),
      })
      .returning();
    for (const m of t.members) {
      await db.insert(teamMembers).values({ teamId: team.id, userId: userRows[m].id });
    }
  }

  // ---- Products ----
  const productRows: Product[] = [];
  for (let i = 0; i < SEED_PRODUCTS.length; i++) {
    const p = SEED_PRODUCTS[i];
    const [row] = await db
      .insert(products)
      .values({
        sku: p.sku,
        name: p.name,
        description: p.description,
        category: p.category,
        icon: p.icon,
        price: p.price,
        cost: p.cost,
        stock: int(20, 80),
        reorderLevel: p.reorder,
        createdAt: daysAgo(110 - (i % 30)),
      })
      .returning();
    productRows.push(row);
  }

  // ---- Customers ----
  const customerRows: Customer[] = [];
  for (let i = 0; i < SEED_CUSTOMERS.length; i++) {
    const c = SEED_CUSTOMERS[i];
    const sellerPool = [userRows[2], userRows[3], userRows[4]];
    const [row] = await db
      .insert(customers)
      .values({
        name: c.name,
        company: c.company,
        email: c.email,
        phone: c.phone,
        city: c.city,
        country: "United States",
        status: c.status,
        ownerId: pick(sellerPool).id,
        createdAt: daysAgo(95 - (i % 70), 10),
      })
      .returning();
    customerRows.push(row);
  }

  // ---- Orders ----
  const sellers = [userRows[1], userRows[2], userRows[3], userRows[4], userRows[5]];
  const soldQty = new Map<string, number>();
  const activityInserts: Array<{
    actorId: string;
    actorName: string;
    action: string;
    targetType: string;
    summary: string;
    createdAt: Date;
  }> = [];
  let invoiceCounter = 2001;

  for (let i = 0; i < 42; i++) {
    const ageDays = Math.floor(Math.pow(rng(), 1.35) * 92) + (i < 6 ? 0 : 0);
    const created = daysAgo(ageDays);
    const customer = pick(customerRows);
    const seller = pick(sellers);

    let status: Order["status"];
    const r = rng();
    if (ageDays <= 3) {
      status = r < 0.3 ? "pending" : r < 0.65 ? "processing" : "shipped";
    } else if (ageDays <= 16) {
      status = r < 0.12 ? "processing" : r < 0.5 ? "shipped" : r < 0.92 ? "delivered" : "cancelled";
    } else {
      status = r < 0.1 ? "cancelled" : "delivered";
    }

    const count = rng() < 0.5 ? 1 : rng() < 0.8 ? 2 : 3;
    const chosen = pickN(productRows, count);
    const items = chosen.map((p) => {
      const qty = p.price > 30000 ? int(1, 2) : int(1, 6);
      if (status !== "cancelled" && status !== "pending") {
        soldQty.set(p.id, (soldQty.get(p.id) ?? 0) + qty);
      }
      return {
        productId: p.id,
        name: p.name,
        sku: p.sku,
        qty,
        unitPrice: p.price,
        lineTotal: p.price * qty,
      };
    });
    const realSubtotal = items.reduce((s, it) => s + it.lineTotal, 0);
    const tax = Math.round(realSubtotal * 0.0825);
    const total = realSubtotal + tax;

    const [order] = await db
      .insert(orders)
      .values({
        orderNumber: `ORD-${1001 + i}`,
        customerId: customer.id,
        sellerId: seller.id,
        status,
        subtotal: realSubtotal,
        tax,
        total: status === "cancelled" ? 0 : total,
        shippingAddress: `${pick(STREETS)}, ${customer.city}`,
        notes: rng() < 0.3 ? "Customer requested contactless delivery." : null,
        createdAt: created,
        updatedAt: created,
      })
      .returning();

    for (const it of items) {
      await db.insert(orderItems).values({ orderId: order.id, ...it });
    }

    activityInserts.push({
      actorId: seller.id,
      actorName: seller.name,
      action: "order.created",
      targetType: "order",
      summary: `Created order ${order.orderNumber} for ${customer.company}`,
      createdAt: created,
    });

    if (status === "shipped" || status === "delivered") {
      activityInserts.push({
        actorId: seller.id,
        actorName: seller.name,
        action: "order.shipped",
        targetType: "order",
        summary: `Shipped ${order.orderNumber} to ${customer.company}`,
        createdAt: addDays(created, 2),
      });
    }
    if (status === "delivered") {
      activityInserts.push({
        actorId: seller.id,
        actorName: seller.name,
        action: "order.delivered",
        targetType: "order",
        summary: `Delivered ${order.orderNumber} for ${customer.company}`,
        createdAt: addDays(created, 5),
      });
    }

    // ---- Invoices ----
    if (["processing", "shipped", "delivered"].includes(status) && rng() < 0.88) {
      const issued = addDays(created, 1);
      const due = addDays(issued, 14);
      let invStatus: Invoice["status"] = "sent";
      let paidAt: Date | null = null;
      if (status === "delivered" && ageDays > 22) {
        invStatus = "paid";
        paidAt = addDays(issued, int(4, 12));
      } else if (due < new Date()) {
        invStatus = rng() < 0.55 ? "overdue" : "paid";
        if (invStatus === "paid") paidAt = addDays(issued, int(6, 13));
      } else if (ageDays <= 2) {
        invStatus = rng() < 0.4 ? "draft" : "sent";
      }

      await db.insert(invoices).values({
        invoiceNumber: `INV-${invoiceCounter++}`,
        orderId: order.id,
        customerId: customer.id,
        sellerId: seller.id,
        amount: realSubtotal,
        tax,
        status: invStatus,
        issuedAt: issued,
        dueDate: due,
        paidAt,
        createdAt: issued,
      });
      if (invStatus !== "draft") {
        activityInserts.push({
          actorId: seller.id,
          actorName: seller.name,
          action: "invoice.sent",
          targetType: "invoice",
          summary: `Sent invoice INV-${invoiceCounter - 1} to ${customer.company}`,
          createdAt: issued,
        });
      }
    }
  }

  // ---- Reconcile stock based on demand, force some low-stock items ----
  for (const p of productRows) {
    const demand = soldQty.get(p.id) ?? 0;
    let stock: number;
    if (["DSP-2002", "NET-6001", "STO-7001", "AUD-1003"].includes(p.sku)) {
      stock = int(0, p.reorderLevel - 2);
    } else if (["ACC-3001", "OFF-5004"].includes(p.sku)) {
      stock = p.reorderLevel + int(-2, 2);
    } else {
      stock = demand + int(12, 60);
    }
    await db.update(products).set({ stock: Math.max(stock, 0) }).where(sql`${products.id} = ${p.id}`);
  }

  // ---- Tasks ----
  for (let i = 0; i < TASK_TITLES.length; i++) {
    const t = TASK_TITLES[i];
    const due = daysAgo(-t.daysDue, 15);
    const done = t.status === "done";
    await db.insert(tasks).values({
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      assigneeId: userRows[t.assignee].id,
      creatorId: userRows[1].id,
      dueDate: due,
      completedAt: done ? addDays(due, -int(0, 2)) : null,
      createdAt: daysAgo(int(5, 30)),
    });
  }

  // ---- Extra activity feed entries ----
  activityInserts.push(
    { actorId: userRows[0].id, actorName: userRows[0].name, action: "team.joined", targetType: "team", summary: "Onboarded Liam O'Connor to Customer Success", createdAt: daysAgo(16, 9) },
    { actorId: userRows[1].id, actorName: userRows[1].name, action: "customer.created", targetType: "customer", summary: "Added lead: Vogel Architecture (Theresa Vogel)", createdAt: daysAgo(4, 11) },
    { actorId: userRows[1].id, actorName: userRows[1].name, action: "customer.created", targetType: "customer", summary: "Added lead: Frost Analytics (Nathan Frost)", createdAt: daysAgo(6, 14) },
    { actorId: userRows[2].id, actorName: userRows[2].name, action: "product.updated", targetType: "product", summary: "Updated pricing for Pulse Bluetooth Speaker", createdAt: daysAgo(2, 16) },
    { actorId: userRows[0].id, actorName: userRows[0].name, action: "report.exported", targetType: "report", summary: "Exported monthly sales report (PDF)", createdAt: daysAgo(1, 17) },
    { actorId: userRows[4].id, actorName: userRows[4].name, action: "invoice.paid", targetType: "invoice", summary: "Recorded payment from Solstice Solar", createdAt: daysAgo(3, 10) }
  );

  activityInserts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  for (const a of activityInserts.slice(0, 80)) {
    await db.insert(activities).values(a);
  }

  const counts = {
    users: userRows.length,
    products: productRows.length,
    customers: customerRows.length,
    orders: 42,
    tasks: TASK_TITLES.length,
  };
  return counts;
}

// Cache so we never seed twice in the same server process
let seedPromise: Promise<boolean> | null = null;

export async function ensureSeed(): Promise<boolean> {
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length > 0) return false;
  if (!seedPromise) {
    seedPromise = resetAndSeed().then(() => true);
  }
  return seedPromise;
}
