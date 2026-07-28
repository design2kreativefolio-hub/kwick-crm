import { redirect } from "next/navigation";

export default function Home() {
  // Landing → dashboard (auth guard in the dashboard layout bounces to /login).
  redirect("/dashboard");
}
