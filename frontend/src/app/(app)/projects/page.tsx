import { ModulePage } from "@/components/ModulePage";

export default function Page() {
  return (
    <ModulePage
      title="Projects & Artwork"
      description="Project tracking plus the structured artwork ID generator."
      endpoint="/api/projects"
    />
  );
}
