import { ModulePage } from "@/components/ModulePage";

export default function Page() {
  return (
    <ModulePage
      title="Sales"
      description="Clients, proposals and invoices (manager only)."
      endpoint="/api/sales/clients"
    />
  );
}
