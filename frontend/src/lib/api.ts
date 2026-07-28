// Thin API client for the Django/DRF backend. Handles JWT access/refresh.

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

const ACCESS_KEY = "kwick-access";
const REFRESH_KEY = "kwick-refresh";

export const tokens = {
  get access() {
    return typeof window !== "undefined" ? localStorage.getItem(ACCESS_KEY) : null;
  },
  get refresh() {
    return typeof window !== "undefined" ? localStorage.getItem(REFRESH_KEY) : null;
  },
  set(access: string, refresh?: string) {
    localStorage.setItem(ACCESS_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

async function refreshAccess(): Promise<string | null> {
  const refresh = tokens.refresh;
  if (!refresh) return null;
  const res = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  tokens.set(data.access);
  return data.access;
}

export async function api<T = any>(
  path: string,
  options: RequestInit & { auth?: boolean } = {}
): Promise<T> {
  const { auth = true, headers, ...rest } = options;
  // FormData needs the browser to set its own multipart boundary — forcing
  // application/json here would silently break file uploads.
  const isFormData = typeof FormData !== "undefined" && rest.body instanceof FormData;
  const doFetch = async (token: string | null) => {
    return fetch(`${API_BASE}${path}`, {
      ...rest,
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
        ...(headers ?? {}),
      },
    });
  };

  let res = await doFetch(auth ? tokens.access : null);

  // Transparent refresh on 401.
  if (res.status === 401 && auth) {
    const newAccess = await refreshAccess();
    if (newAccess) {
      res = await doFetch(newAccess);
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

export { API_BASE };
