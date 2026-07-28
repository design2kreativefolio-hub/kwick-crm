import { ModulePage } from "@/components/ModulePage";

export default function Page() {
  return (
    <ModulePage
      title="Renewals"
      description="Client and staff renewal dates feeding calendar, notifications and dashboard."
      endpoint="/api/renewals"
    />
  );
}
