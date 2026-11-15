"use client";

import { useState } from "react";
import { Sidebar, MobileSidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { ToastProvider } from "@/components/toast";
import type { Role } from "@/db/schema";

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  title: string;
  avatarColor: string;
}

export function AppShell({
  user,
  children,
}: {
  user: AppUser;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <ToastProvider>
      <Sidebar role={user.role} />
      <MobileSidebar open={menuOpen} onClose={() => setMenuOpen(false)} role={user.role} />
      <div className="lg:pl-64 print:!pl-0">
        <Topbar user={user} onMenu={() => setMenuOpen(true)} />
        <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8 print:max-w-none print:p-0">
          {children}
        </main>
      </div>
    </ToastProvider>
  );
}
