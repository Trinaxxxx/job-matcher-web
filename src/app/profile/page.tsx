import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import Nav from "@/components/Nav";
import ProfileForm from "@/components/ProfileForm";

export default async function ProfilePage() {
  const userId = await getUserId();
  if (!userId) redirect("/login");
  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Your profile</h1>
        <p className="mt-1 text-sm text-zinc-500">
          These drive how jobs are scored for you. Nothing here is shared with anyone else.
        </p>
        <ProfileForm />
      </main>
    </>
  );
}
