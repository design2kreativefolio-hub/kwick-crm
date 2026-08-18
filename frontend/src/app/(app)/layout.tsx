"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { MaintenanceBar, MaintenanceProvider } from "@/components/MaintenanceBar";
import { MobileTabBar } from "@/components/MobileTabBar";
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
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("nav-open", isMobile && mobileNavOpen);
    return () => document.documentElement.classList.remove("nav-open");
  }, [isMobile, mobileNavOpen]);

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
        <div className={`shell${isMobile ? " is-mobile-app" : ""}`}>
          <Sidebar
            role={user.role}
            collapsed={isMobile ? false : collapsed}
            mobileOpen={mobileNavOpen}
            onNavigate={() => setMobileNavOpen(false)}
          />
          <div className="shell-main">
            <MaintenanceBar />
            <Topbar
              collapsed={collapsed}
              mobileNavOpen={mobileNavOpen}
              isMobile={isMobile}
              onToggleCollapsed={toggleNav}
            />
            <main className="shell-content">
              <PageTransition>{children}</PageTransition>
            </main>
            {isMobile && (
              <MobileTabBar moreOpen={mobileNavOpen} onMore={() => setMobileNavOpen((v) => !v)} />
            )}
          </div>
        </div>
      </MaintenanceProvider>
    </LiveUpdatesProvider>
  );
}
