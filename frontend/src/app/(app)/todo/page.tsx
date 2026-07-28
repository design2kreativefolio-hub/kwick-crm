import { ModulePage } from "@/components/ModulePage";

export default function Page() {
  return (
    <ModulePage
      title="To-Do"
      description="A lightweight, personal task log — for quick items like 'call a client' or 'email the client', separate from project Tasks."
      endpoint="/api/daily-tracker"
    />
  );
}
