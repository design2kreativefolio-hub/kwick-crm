"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { MaintenanceBar, MaintenanceProvider } from "@/components/MaintenanceBar";
import { PageTransition } from "@/components/PageTransition";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { useAuth } from "@/lib/auth";
import { LiveUpdatesProvider } from "@/lib/liveUpdates";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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

  // The same hamburger button in the Topbar does double duty: on desktop it
  // collapses the sidebar to an icon rail, on mobile it opens/closes the
  // off-canvas drawer — decided by viewport width at click time.
  const toggleNav = () => {
    if (typeof window !== "undefined" && window.innerWidth <= 900) {
      setMobileNavOpen((v) => !v);
    } else {
      setCollapsed((v) => !v);
    }
  };

  return (
    <LiveUpdatesProvider>
      <MaintenanceProvider>
        <div className="shell">
          <Sidebar
            role={user.role}
            collapsed={collapsed}
            mobileOpen={mobileNavOpen}
            onNavigate={() => setMobileNavOpen(false)}
          />
          <div className="shell-main">
            <MaintenanceBar />
            <Topbar collapsed={collapsed} onToggleCollapsed={toggleNav} />
            <main className="shell-content">
              <PageTransition>{children}</PageTransition>
            </main>
          </div>
        </div>
      </MaintenanceProvider>
    </LiveUpdatesProvider>
  );
}
