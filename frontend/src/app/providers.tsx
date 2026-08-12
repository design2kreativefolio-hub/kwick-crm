"use client";

import { AuthProvider } from "@/lib/auth";
import { PwaRegistrar } from "@/lib/pwa";
import { ThemeProvider } from "@/lib/theme";
import { ToastProvider } from "@/lib/toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <PwaRegistrar />
          {children}
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
