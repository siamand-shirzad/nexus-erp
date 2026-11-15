import type {
  Product,
  Customer,
  Order,
  OrderItem,
  Invoice,
  Task,
  Team,
  Activity,
  Role,
} from "@/db/schema";

export interface CustomerRow extends Customer {
  ownerName: string | null;
  ownerColor: string | null;
  orderCount: number;
  lifetimeValue: number;
}

export interface OrderRow extends Order {
  customerName: string;
  customerCompany: string | null;
  sellerName: string | null;
  sellerColor: string | null;
  itemCount: number;
}

export interface OrderDetailRow extends OrderRow {
  items: OrderItem[];
  customerEmail: string | null;
  customerPhone: string | null;
  customerAddress?: string | null;
}

export interface InvoiceRow extends Invoice {
  customerName: string;
  customerCompany: string | null;
  sellerName: string | null;
  sellerColor: string | null;
  orderNumber: string;
}

export interface InvoiceDetail extends InvoiceRow {
  items: OrderItem[];
  customerEmail: string | null;
  customerAddress: string | null;
  notes: string | null;
}

export interface TaskRow extends Task {
  assigneeName: string | null;
  assigneeColor: string | null;
  creatorName: string | null;
}

export interface TeamMemberRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  title: string | null;
  department: string | null;
  phone: string | null;
  avatarColor: string;
  status: "active" | "disabled";
  createdAt: Date;
  orderCount: number;
  customerCount: number;
  openTasks: number;
  teamIds: string[];
}

export interface TeamRow extends Team {
  leadName: string | null;
  members: Array<{
    id: string;
    name: string;
    title: string | null;
    role: Role;
    avatarColor: string;
  }>;
  memberCount: number;
}

export interface ActivityRow extends Activity {
  actorColor: string | null;
}

export type { Product, Customer, Order, Invoice, Task, Activity };
