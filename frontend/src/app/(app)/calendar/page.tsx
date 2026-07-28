import { ModulePage } from "@/components/ModulePage";

export default function Page() {
  return (
    <ModulePage
      title="Calendar"
      description="Merged agenda: tasks, daily tracker, renewals and manual reminders."
      endpoint="/api/calendar/agenda"
    />
  );
}
