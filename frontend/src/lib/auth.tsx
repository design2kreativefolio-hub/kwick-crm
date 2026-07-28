"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { api, tokens } from "./api";

export type User = {
  id: number;
  email: string;
  full_name: string;
  role: "manager" | "employee";
  status: string;
};

const AuthContext = createContext<{
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}>({ user: null, loading: true, login: async () => {}, logout: () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

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
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
