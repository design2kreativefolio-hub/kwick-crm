// Thin API client for the Django/DRF backend. Auth is HttpOnly cookies.

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

function wipeLegacyTokenStorage() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem("kwick-access");
    localStorage.removeItem("kwick-refresh");
  } catch {
    /* ignore */
  }
}

wipeLegacyTokenStorage();

/** One in-flight refresh so a page of parallel 401s does not rotate the cookie N times. */
let refreshPromise: Promise<boolean> | null = null;

export async function refreshSession(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      return res.ok;
    } catch {
      return false;
    }
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

export function wsUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_WS_BASE_URL ?? "ws://localhost:8000").replace(/\/$/, "");
  const prefix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${prefix}`;
}

export async function api<T = any>(
  path: string,
  options: RequestInit & { auth?: boolean } = {}
): Promise<T> {
  const { auth = true, headers, ...rest } = options;
  // FormData needs the browser to set its own multipart boundary — forcing
  // application/json here would silently break file uploads.
  const isFormData = typeof FormData !== "undefined" && rest.body instanceof FormData;
  const doFetch = async () => {
    return fetch(`${API_BASE}${path}`, {
      ...rest,
      credentials: "include",
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...(headers ?? {}),
      },
    });
  };

  let res = await doFetch();

  // Transparent refresh on 401.
  if (res.status === 401 && auth) {
    if (await refreshSession()) {
      res = await doFetch();
    }
  }

  if (!res.ok) {
    let detail: any;
    try {
      detail = await res.json();
    } catch {
      detail = { detail: res.statusText };
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// DRF paginates every ModelViewSet .list() by default (see common/pagination.py),
// so list endpoints return {count, next, previous, results} rather than a bare
// array. Endpoints backed by plain APIViews (manual Response(...)) stay arrays.
export function unwrapList<T>(data: T[] | { results: T[] }): T[] {
  return Array.isArray(data) ? data : data.results;
}

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(status: number, data: any) {
    super(data?.detail || `Request failed (${status})`);
    this.status = status;
    this.data = data;
  }
}

// DRF validation errors come back as {field: ["message", ...]} — turn that
// into a readable sentence instead of dumping raw JSON in the UI.
export function formatApiError(data: any): string {
  if (!data) return "Something went wrong.";
  if (typeof data === "string") return data;
  if (typeof data.detail === "string" && data.detail.trim()) return data.detail;
  if (Array.isArray(data.detail)) return data.detail.map(String).join(" ");
  if (Array.isArray(data)) return data.map(String).join(" ");
  if (data.message) return data.message;
  const messages: string[] = [];
  for (const key of Object.keys(data)) {
    if (key === "detail") continue;
    const val = data[key];
    const prefix = /^\d+$/.test(key) ? "" : `${key}: `;
    if (Array.isArray(val)) messages.push(`${prefix}${val.join(" ")}`);
    else if (typeof val === "string" && val.trim()) messages.push(`${prefix}${val}`);
    else if (val && typeof val === "object") {
      const nested = formatApiError(val);
      if (nested && !nested.startsWith("Something went wrong")) {
        messages.push(prefix ? `${prefix}${nested}` : nested);
      }
    }
  }
  if (messages.length) return messages.join(" ");
  return "Something went wrong. Please try again.";
}

export { API_BASE };
