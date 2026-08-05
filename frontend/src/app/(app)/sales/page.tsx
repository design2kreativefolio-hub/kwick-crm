"use client";

import { useEffect } from "react";

import { useRouter } from "next/navigation";

// Sales is now a sidebar dropdown (Clients / Proposals / Invoices), each its
// own route — bare /sales (old bookmarks, search results) lands here and
// forwards to Clients.
export default function SalesPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/sales/clients");
  }, [router]);

  return null;
}
