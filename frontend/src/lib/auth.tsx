"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { api, tokens } from "./api";

export type StaffProfile = {
  job_title: string;
  department: string;
  date_joined: string | null;
  phone: string;
  avatar_url: string;
  visa_renewal_date: string | null;
  insurance_renewal_date: string | null;
  iloe_renewal_date: string | null;
};

export type Module =
  | "hr"
  | "hr_documents"
  | "hr_staff"
  | "sales"
  | "sales_clients"
  | "sales_proposals"
  | "sales_invoices"
  | "renewals"
  | "reports";

const MODULE_CHILDREN: Partial<Record<Module, Module[]>> = {
  hr: ["hr_documents", "hr_staff"],
  sales: ["sales_clients", "sales_proposals", "sales_invoices"],
};
const MODULE_PARENT: Partial<Record<Module, Module>> = {
  hr_documents: "hr",
  hr_staff: "hr",
  sales_clients: "sales",
  sales_proposals: "sales",
  sales_invoices: "sales",
};

/** True if grants cover `module` (parent covers children; any child covers parent). */
export function hasModuleAccess(grants: readonly string[] | undefined, module: Module): boolean {
  const access = grants ?? [];
  if (access.includes(module)) return true;
  const parent = MODULE_PARENT[module];
  if (parent && access.includes(parent)) return true;
  const children = MODULE_CHILDREN[module];
  if (children?.some((c) => access.includes(c))) return true;
  return false;
}

export type User = {
  id: number;
  email: string;
  full_name: string;
  role: "superadmin" | "employee";
  status: string;
  profile?: StaffProfile;
  module_access: Module[];
};

const AuthContext = createContext<{
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}>({ user: null, loading: true, login: async () => {}, logout: () => {}, refreshUser: async () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refreshUser = async () => {
    if (!tokens.access) return;
    try {
      const me = await api<User>("/api/auth/me");
      setUser(me);
    } catch {
      // ignore — caller's own error handling covers the failing request that triggered this
    }
  };

  useEffect(() => {
    (async () => {
      if (!tokens.access) {
        setLoading(false);
        return;
      }
      try {
        const me = await api<User>("/api/auth/me");
        setUser(me);
      } catch {
        tokens.clear();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const data = await api<{ access: string; refresh: string; user: User }>("/api/auth/login", {
      method: "POST",
      auth: false,
      body: JSON.stringify({ email, password }),
    });
    tokens.set(data.access, data.refresh);
    setUser(data.user);
    router.push("/dashboard");
  };

  const logout = () => {
    tokens.clear();
    setUser(null);
    router.push("/login");
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
