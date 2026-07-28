import { ModulePage } from "@/components/ModulePage";

export default function Page() {
  return (
    <ModulePage
      title="Notifications"
      description="Web-push + in-app events; recurring-until-actioned reminders."
      endpoint="/api/notifications · ws /ws/notifications/"
    />
  );
}
