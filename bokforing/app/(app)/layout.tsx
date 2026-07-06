import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { Tabs } from "./tabs";
import { LogoutButton } from "./logout-button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: company } = await supabase
    .from("companies")
    .select("name")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!company) redirect("/onboarding");

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="mark tb-logo">Bf</div>
        <div>
          <div className="tb-name">{company.name}</div>
          <div className="tb-sub">Enskild firma · Bokföring</div>
        </div>
        <div className="tb-spacer" />
        <LogoutButton />
      </div>
      <Tabs />
      <div className="content">{children}</div>
    </div>
  );
}
