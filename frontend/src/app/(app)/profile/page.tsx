import { ModulePage } from "@/components/ModulePage";

export default function Page() {
  return (
    <ModulePage
      title="Profile"
      description="Edit profile; employees can request leave and raise tickets."
      endpoint="/api/auth/me · /api/hr/leaves · /api/hr/tickets"
    />
  );
}
