import { ModulePage } from "@/components/ModulePage";

export default function Page() {
  return (
    <ModulePage
      title="Messages"
      description="Real-time internal chat over WebSockets."
      endpoint="/api/messages/conversations · ws /ws/messages/{id}/"
    />
  );
}
