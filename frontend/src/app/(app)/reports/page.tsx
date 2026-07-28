import { ModulePage } from "@/components/ModulePage";

export default function Page() {
  return (
    <ModulePage
      title="Reports"
      description="Cross-module summary for managers."
      endpoint="/api/reports/summary"
    />
  );
}
