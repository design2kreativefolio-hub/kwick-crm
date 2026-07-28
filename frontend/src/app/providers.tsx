"use client";

import { AuthProvider } from "@/lib/auth";
import { ToastProvider } from "@/lib/toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <AuthProvider>{children}</AuthProvider>
    </ToastProvider>
  );
}
