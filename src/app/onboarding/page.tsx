import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import Nav from "@/components/Nav";
import OnboardingWizard from "@/components/OnboardingWizard";

export default async function OnboardingPage() {
  const userId = await getUserId();
  if (!userId) redirect("/login");
  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-3xl">
        <OnboardingWizard />
      </main>
    </>
  );
}
