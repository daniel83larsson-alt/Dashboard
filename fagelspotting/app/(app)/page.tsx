import { createClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import type { Sighting } from "@/lib/supabase-types";
import { SpotterClient } from "./spotter-client";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: sightings } = await supabase
    .from("birdspot_sightings")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const rows = (sightings ?? []) as Sighting[];
  const totalScore = rows.reduce((sum, s) => sum + s.score_awarded, 0);
  const recent = rows.slice(0, 5);

  return (
    <>
      <h1 className="page-title">Spotta en fågel</h1>
      <div className="page-desc">Fota en fågel, låt AI:n känna igen arten, samla poäng.</div>

      <div className="cards">
        <div className="card">
          <div className="k">Dina poäng</div>
          <div className="v" data-testid="total-score">
            {totalScore}
          </div>
        </div>
        <div className="card">
          <div className="k">Fynd</div>
          <div className="v">{rows.length}</div>
        </div>
      </div>

      <SpotterClient />

      <div className="section">
        <div className="stitle">Dina senaste fynd</div>
        <div className="panel">
          {recent.length === 0 ? (
            <div className="empty">
              <div className="et">Inga fynd ännu</div>
              <div className="es">Spotta din första fågel ovan.</div>
            </div>
          ) : (
            recent.map((s) => (
              <div className="status-line" key={s.id}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{s.species_name}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>
                    {new Date(s.created_at).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" })}
                  </div>
                </div>
                <div style={{ fontWeight: 800, color: "var(--accent-strong)" }}>+{s.score_awarded}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
