"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { MyDayView } from "@/components/bd/MyDayView";
import { hasSalesDashboard, useAuth } from "@/lib/auth";

/** Business Development overview. For the superadmin it is "Overview" (everyone's work); for a BDE on
 *  the Sales dashboard it IS the Dashboard, so this route just sends them there. */
export default function BdHomePage() {
  const { user } = useAuth();
  const router = useRouter();
  const goDashboard = hasSalesDashboard(user);

  useEffect(() => {
    if (goDashboard) router.replace("/dashboard");
  }, [goDashboard, router]);

  if (!user || goDashboard) return null;
  return <MyDayView />;
}
