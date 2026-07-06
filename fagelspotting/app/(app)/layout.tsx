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

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="mark tb-logo">🐦</div>
        <div className="tb-name">Fågelspotting</div>
        <div className="tb-spacer" />
        <LogoutButton />
      </div>
      <Tabs />
      <div className="content">{children}</div>
    </div>
  );
}
