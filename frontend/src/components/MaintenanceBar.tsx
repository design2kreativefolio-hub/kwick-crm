"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { fetchMaintenance, setMaintenance, type MaintenanceStatus } from "@/lib/maintenance";
import { useToast } from "@/lib/toast";

type Ctx = {
  status: MaintenanceStatus | null;
  busy: boolean;
  toggle: () => Promise<void>;
};

const MaintenanceCtx = createContext<Ctx>({
  status: null,
  busy: false,
  toggle: async () => {},
});

export function MaintenanceProvider({ children }: { children: React.ReactNode }) {
  const { showToast } = useToast();
  const [status, setStatus] = useState<MaintenanceStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchMaintenance(true)
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  const toggle = useCallback(async () => {
    if (!status?.can_bypass) return;
    setBusy(true);
    try {
      const next = await setMaintenance(!status.enabled);
      setStatus(next);
      showToast(next.enabled ? "Maintenance on — staff are locked out." : "Maintenance off — site is open.");
    } catch (err: any) {
      showToast(err?.message ?? "Could not update maintenance mode.", "error");
    } finally {
      setBusy(false);
    }
  }, [status, showToast]);

  return (
    <MaintenanceCtx.Provider value={{ status, busy, toggle }}>
      {children}
    </MaintenanceCtx.Provider>
  );
}

export function useMaintenanceGate() {
  return useContext(MaintenanceCtx);
}

export function MaintenanceBar() {
  const { status, busy, toggle } = useMaintenanceGate();
  if (!status?.can_bypass || !status.enabled) return null;

  return (
    <div className="maintenance-bar">
      <span>
        <i className="bi bi-tools" aria-hidden />
        Maintenance is on — only your developer account can use the site.
      </span>
      <button type="button" className="btn btn-sm" onClick={toggle} disabled={busy}>
        {busy ? "Updating…" : "Turn off"}
      </button>
    </div>
  );
}
