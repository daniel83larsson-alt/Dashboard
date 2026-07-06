import { createClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import type { LeaderboardRow } from "@/lib/supabase-types";

export const dynamic = "force-dynamic";

function LeaderboardList({ rows, testId }: { rows: LeaderboardRow[]; testId: string }) {
  if (rows.length === 0) {
    return (
      <div className="panel">
        <div className="empty">
          <div className="et">Inga fynd ännu</div>
          <div className="es">Bli den första på listan.</div>
        </div>
      </div>
    );
  }
  return (
    <div className="panel" data-testid={testId}>
      {rows.map((row, i) => (
        <div className="status-line" key={row.user_id}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className={`rank-badge ${i === 0 ? "top" : ""}`}>{i + 1}</div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{row.email}</div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>{row.sighting_count} fynd</div>
            </div>
          </div>
          <div style={{ fontWeight: 800, color: "var(--accent-strong)" }}>{row.total_score} p</div>
        </div>
      ))}
    </div>
  );
}

export default async function LeaderboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: allTime }, { data: weekly }] = await Promise.all([
    supabase.rpc("birdspot_leaderboard", { period: "all" }),
    supabase.rpc("birdspot_leaderboard", { period: "week" }),
  ]);

  return (
    <>
      <h1 className="page-title">Topplista</h1>
      <div className="page-desc">Poäng summeras per art, baserat på sällsynthet.</div>

      <div className="section">
        <div className="stitle">Topp 10 totalt</div>
        <LeaderboardList rows={(allTime ?? []) as LeaderboardRow[]} testId="leaderboard-alltime" />
      </div>

      <div className="section">
        <div className="stitle">Veckans topp</div>
        <LeaderboardList rows={(weekly ?? []) as LeaderboardRow[]} testId="leaderboard-weekly" />
      </div>
    </>
  );
}
