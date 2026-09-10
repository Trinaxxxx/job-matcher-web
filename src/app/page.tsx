import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import Landing from "@/components/Landing";

export default async function Home() {
  const userId = await getUserId();
  if (userId) redirect("/dashboard");
  return <Landing />;
}
