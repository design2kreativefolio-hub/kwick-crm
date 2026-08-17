import { api, ApiError } from "./api";

export type MaintenanceStatus = {
  enabled: boolean;
  can_bypass: boolean;
  allowlist_configured: boolean;
};

export function isMaintenanceError(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  if (err.status === 503 && err.data?.code === "maintenance") return true;
  const detail = typeof err.data?.detail === "string" ? err.data.detail : err.message;
  return err.status === 503 && /maintenance/i.test(detail || "");
}

export async function fetchMaintenance(auth = false): Promise<MaintenanceStatus> {
  return api<MaintenanceStatus>("/api/maintenance", { auth });
}

export async function setMaintenance(enabled: boolean): Promise<MaintenanceStatus> {
  return api<MaintenanceStatus>("/api/maintenance", {
    method: "POST",
    body: JSON.stringify({ enabled }),
  });
}
