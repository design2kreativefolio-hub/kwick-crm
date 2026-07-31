"use client";

import { AuthProvider } from "@/lib/auth";
import { PwaRegistrar } from "@/lib/pwa";
import { ToastProvider } from "@/lib/toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <AuthProvider>
        <PwaRegistrar />
        {children}
      </AuthProvider>
    </ToastProvider>
  );
}
