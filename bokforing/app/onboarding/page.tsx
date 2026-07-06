import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { OnboardingForm } from "./form";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (company) redirect("/");

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="mark">Bf</div>
        <h1>Skapa ditt företag</h1>
        <p>Vad heter din enskilda firma? Räkenskapsåret sätts automatiskt till kalenderår.</p>
        <OnboardingForm />
      </div>
    </div>
  );
}
