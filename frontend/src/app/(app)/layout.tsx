"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { useAuth } from "@/lib/auth";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100vh" }}>
        <span className="muted">Loading…</span>
      </div>
    );
  }

  return (
    <div className="shell">
      <Sidebar role={user.role} collapsed={collapsed} />
      <div className="shell-main">
        <Topbar collapsed={collapsed} onToggleCollapsed={() => setCollapsed((v) => !v)} />
        <main className="shell-content">{children}</main>
      </div>
    </div>
  );
}
