import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nexus ERP — Business Operations Suite",
  description:
    "Small-business accounting with double-entry books, ledgers and bank reconciliation, plus sales operations.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#f4f5fb] text-slate-900 antialiased">{children}</body>
    </html>
  );
}
