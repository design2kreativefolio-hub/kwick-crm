"use client";

import { useState } from "react";

import { EditProfileTab } from "@/components/profile/EditProfileTab";
import { LeaveRequestsTab } from "@/components/profile/LeaveRequestsTab";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { RaiseTicketTab } from "@/components/profile/RaiseTicketTab";
import { Reveal } from "@/components/Reveal";
import { useAuth } from "@/lib/auth";

type Tab = "profile" | "leave" | "ticket";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "profile", label: "Edit Profile", icon: "bi-person-fill" },
  { key: "leave", label: "Leave Requests", icon: "bi-calendar-check-fill" },
  { key: "ticket", label: "Raise a Ticket", icon: "bi-life-preserver" },
];

export default function ProfilePage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("profile");
  const isManager = user?.role === "manager";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Reveal index={0}>
        <ProfileHeader
          tabs={isManager ? undefined : TABS}
          activeTab={tab}
          onTabChange={(k) => setTab(k as Tab)}
        />
      </Reveal>

      <Reveal index={1}>
        {isManager || tab === "profile" ? (
          <EditProfileTab />
        ) : tab === "leave" ? (
          <LeaveRequestsTab />
        ) : (
          <RaiseTicketTab />
        )}
      </Reveal>
    </div>
  );
}
