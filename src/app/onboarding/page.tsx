import { redirect } from "next/navigation";
import { getAthlete, getUser } from "@/lib/data/athlete";
import { OnboardingForm } from "./onboarding-form";
import { LogoMark } from "@/components/shell/icons";

export default async function OnboardingPage() {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  const athlete = await getAthlete();
  if (athlete) redirect("/");

  return (
    <div className="min-h-dvh bg-app px-5 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-7 flex items-center gap-3">
          <LogoMark size={38} />
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">Set up your athlete profile</h1>
            <p className="text-xs text-subtle">
              Everything here feeds the generator — equipment filters movements, impediments
              constrain them.
            </p>
          </div>
        </div>
        <OnboardingForm defaultName={user.name} />
      </div>
    </div>
  );
}
