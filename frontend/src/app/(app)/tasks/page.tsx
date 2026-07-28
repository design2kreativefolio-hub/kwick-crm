import { ModulePage } from "@/components/ModulePage";

export default function Page() {
  return (
    <ModulePage
      title="Tasks"
      description="Project-linked task tracking. Employees see only their own."
      endpoint="/api/tasks"
    />
  );
}
