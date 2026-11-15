"use client";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const BRAND = {
  name: "Nexus ERP",
  legalName: "Nexus ERP, Inc.",
  tagline: "Business Operations Suite",
  address1: "500 Market Street, Suite 1200",
  address2: "San Francisco, CA 94105",
  email: "billing@nexuserp.io",
  accent: [79, 70, 229] as [number, number, number],
};

const STATUS_COLORS: Record<string, [number, number, number]> = {
  paid: [22, 163, 74],
  sent: [2, 132, 199],
  overdue: [220, 38, 38],
  draft: [100, 116, 139],
  void: [71, 85, 105],
  delivered: [22, 163, 74],
  shipped: [2, 132, 199],
  processing: [124, 58, 237],
  pending: [217, 119, 6],
  cancelled: [100, 116, 139],
};

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format((cents ?? 0) / 100);

const fmtDate = (d?: string | Date | null) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

function footer(doc: jsPDF) {
  const pages = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.line(40, 798, w - 40, 798);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `${BRAND.legalName} · ${BRAND.email} · Generated ${fmtDate(new Date())}`,
      40,
      812
    );
    doc.text(`Page ${i} of ${pages}`, w - 40, 812, { align: "right" });
  }
}

function logoMark(doc: jsPDF, x: number, y: number, size = 14) {
  doc.setFillColor(...BRAND.accent);
  doc.roundedRect(x, y, size, size, 3, 3, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(size * 0.62);
  doc.text("N", x + size / 2, y + size * 0.72, { align: "center" });
  doc.setTextColor(15, 23, 42);
}

// ---------------------------------------------------------------------------
// Generic tabular report
// ---------------------------------------------------------------------------

export interface ReportSummary {
  label: string;
  value: string;
}

export function exportReportPdf(opts: {
  filename: string;
  title: string;
  subtitle?: string;
  columns: string[];
  rows: Array<Array<string | number>>;
  summary?: ReportSummary[];
  totals?: Array<string | number | null>;
}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const w = doc.internal.pageSize.getWidth();

  logoMark(doc, 40, 36);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(15, 23, 42);
  doc.text(opts.title, 62, 48);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    opts.subtitle ?? `Generated ${new Date().toLocaleString("en-US")}`,
    62,
    62
  );

  let startY = 88;

  if (opts.summary?.length) {
    const gap = 12;
    const boxW = (w - 80 - gap * (opts.summary.length - 1)) / opts.summary.length;
    opts.summary.forEach((s, i) => {
      const x = 40 + i * (boxW + gap);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(x, 78, boxW, 52, 6, 6, "F");
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.setFont("helvetica", "normal");
      doc.text(s.label.toUpperCase(), x + 12, 98);
      doc.setFontSize(15);
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.text(s.value, x + 12, 119);
    });
    startY = 148;
  }

  autoTable(doc, {
    startY,
    head: [opts.columns],
    body: opts.rows.map((r) => r.map((c) => String(c ?? ""))),
    foot: opts.totals ? [opts.totals.map((c) => String(c ?? ""))] : undefined,
    styles: {
      fontSize: 9,
      cellPadding: 6,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: BRAND.accent,
      textColor: 255,
      fontStyle: "bold",
      fontSize: 9,
    },
    footStyles: {
      fillColor: [238, 242, 255],
      textColor: [49, 46, 129],
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 40, right: 40 },
  });

  const finalY = (
    doc as unknown as { lastAutoTable: { finalY: number } }
  ).lastAutoTable.finalY;

  doc.setFontSize(8.5);
  doc.setTextColor(148, 163, 184);
  doc.setFont("helvetica", "normal");
  doc.text(
    "Confidential — for internal business use only.",
    40,
    finalY + 22
  );

  footer(doc);
  doc.save(opts.filename);
}

// ---------------------------------------------------------------------------
// Branded invoice PDF
// ---------------------------------------------------------------------------

export interface InvoicePdfItem {
  sku?: string | null;
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface InvoicePdfData {
  number: string;
  status: string;
  issuedAt: string | Date;
  dueDate?: string | Date | null;
  paidAt?: string | Date | null;
  orderNumber: string;
  customer: {
    name: string;
    company?: string | null;
    email?: string | null;
    address?: string | null;
  };
  items: InvoicePdfItem[];
  subtotal: number;
  tax: number;
  total: number;
  sellerName?: string | null;
  notes?: string | null;
}

export function exportInvoicePdf(inv: InvoicePdfData) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const w = doc.internal.pageSize.getWidth();

  // Header band
  doc.setFillColor(...BRAND.accent);
  doc.rect(0, 0, w, 112, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(BRAND.name, 40, 50);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(224, 226, 254);
  doc.text(BRAND.tagline, 40, 68);
  doc.text(BRAND.address1, 40, 82);
  doc.text(`${BRAND.address2}  ·  ${BRAND.email}`, 40, 96);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(255, 255, 255);
  doc.text("INVOICE", w - 40, 48, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(224, 226, 254);
  doc.text(inv.number, w - 40, 70, { align: "right" });

  // Status pill
  const label = inv.status.toUpperCase();
  doc.setFontSize(8.5);
  const pillW = doc.getTextWidth(label) + 22;
  const pillX = w - 40 - pillW;
  const color = STATUS_COLORS[inv.status] ?? [100, 116, 139];
  doc.setFillColor(...color);
  doc.roundedRect(pillX, 80, pillW, 18, 9, 9, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.text(label, pillX + pillW / 2, 92.5, { align: "center" });

  // Bill to
  doc.setTextColor(100, 116, 139);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("BILLED TO", 40, 148);
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(12);
  doc.text(inv.customer.company ?? inv.customer.name, 40, 168);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  let by = 184;
  if (inv.customer.company) {
    doc.text(`Attn: ${inv.customer.name}`, 40, by);
    by += 14;
  }
  if (inv.customer.email) {
    doc.text(inv.customer.email, 40, by);
    by += 14;
  }
  if (inv.customer.address) {
    doc.text(inv.customer.address, 40, by, { maxWidth: 230 });
  }

  // Meta block (right)
  const meta: Array<[string, string]> = [
    ["Invoice #", inv.number],
    ["Order #", inv.orderNumber],
    ["Issued", fmtDate(inv.issuedAt)],
    ["Due date", fmtDate(inv.dueDate)],
    ...(inv.paidAt ? ([["Paid", fmtDate(inv.paidAt)]] as Array<[string, string]>) : []),
    ...(inv.sellerName ? ([["Account manager", inv.sellerName]] as Array<[string, string]>) : []),
  ];
  let my = 150;
  meta.forEach(([k, v]) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(100, 116, 139);
    doc.text(k, w - 210, my);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(v, w - 40, my, { align: "right" });
    my += 18;
  });

  // Items table
  autoTable(doc, {
    startY: 218,
    head: [["SKU", "Description", "Qty", "Unit Price", "Amount"]],
    body: inv.items.map((it) => [
      it.sku ?? "—",
      it.name,
      String(it.qty),
      money(it.unitPrice),
      money(it.lineTotal),
    ]),
    styles: {
      fontSize: 9.5,
      cellPadding: 8,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: [238, 242, 255],
      textColor: [49, 46, 129],
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 78 },
      1: { cellWidth: 235 },
      2: { cellWidth: 45, halign: "right" },
      3: { cellWidth: 88, halign: "right" },
      4: { cellWidth: 88, halign: "right" },
    },
    margin: { left: 40, right: 40 },
  });

  const finalY = (
    doc as unknown as { lastAutoTable: { finalY: number } }
  ).lastAutoTable.finalY;

  // Totals
  const totalsX = w - 250;
  let ty = finalY + 26;
  const line = (label2: string, value: string, bold = false) => {
    doc.setFont(bold ? "helvetica" : "helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 12 : 10);
    doc.setTextColor(bold ? 15 : 100, bold ? 23 : 116, bold ? 42 : 139);
    doc.text(label2, totalsX, ty);
    doc.text(value, w - 40, ty, { align: "right" });
    ty += 20;
  };
  line("Subtotal", money(inv.subtotal));
  line("Sales tax (8.25%)", money(inv.tax));
  doc.setDrawColor(226, 232, 240);
  doc.line(totalsX, ty - 8, w - 40, ty - 8);
  line("Total due", money(inv.total), true);

  if (inv.status === "paid") {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(22, 163, 74);
    doc.text("✓ PAID IN FULL", w - 40, ty + 8, { align: "right" });
  }

  if (inv.notes) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text("NOTES", 40, ty + 20);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text(doc.splitTextToSize(inv.notes, 300), 40, ty + 36);
  }

  // Thank-you band near bottom
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(40, 720, w - 80, 54, 8, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(49, 46, 129);
  doc.text("Thank you for your business!", 56, 742);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(
    "Payment is due within 14 days of issue. Make checks payable to Nexus ERP, Inc.",
    56,
    760
  );

  footer(doc);
  doc.save(`${inv.number.replace(/\s+/g, "-")}.pdf`);
}
