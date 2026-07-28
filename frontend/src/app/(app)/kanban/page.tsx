import { ModulePage } from "@/components/ModulePage";

export default function Page() {
  return (
    <ModulePage
      title="Kanban"
      description="Visual board over existing tasks (manager only)."
      endpoint="/api/kanban/board"
    />
  );
}
