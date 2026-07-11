import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type CompanyRow = {
  user_id: string;
  email: string;
  company_id: string | null;
  company_name: string | null;
  company_created_at: string | null;
  user_created_at: string;
};
type CallStatsRow = { user_id: string; calls_today: number; calls_7d: number };
type EventRow = {
  event_type: "signup" | "voucher";
  user_id: string;
  email: string;
  label: string;
  occurred_at: string;
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" });
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const isAdmin = process.env.ADMIN_EMAIL && user.email === process.env.ADMIN_EMAIL;
  if (!isAdmin) {
    return (
      <div className="content">
        <div className="panel" style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontWeight: 600 }}>Ingen åtkomst</div>
        </div>
      </div>
    );
  }

  const [{ data: companies }, { data: callStats }, { data: events }] = await Promise.all([
    supabase.rpc("admin_list_companies"),
    supabase.rpc("admin_api_call_stats"),
    supabase.rpc("admin_recent_events"),
  ]);

  const companyRows = (companies ?? []) as CompanyRow[];
  const eventRows = (events ?? []) as EventRow[];
  const callsByUser = new Map<string, CallStatsRow>(
    ((callStats ?? []) as CallStatsRow[]).map((c) => [c.user_id, c])
  );

  return (
    <div className="content">
      <h1 className="page-title">Admin</h1>
      <div className="page-desc">{companyRows.length} registrerade konton</div>

      {eventRows.length > 0 && (
        <div className="section">
          <div className="stitle">Senaste händelser</div>
          <div className="panel">
            {eventRows.map((e, i) => (
              <div className="status-line" key={i} style={{ padding: "12px 18px" }}>
                <div>
                  <div style={{ fontSize: 13 }}>
                    {e.email} — {e.event_type === "signup" ? "Nytt konto" : `bokförde: ${e.label}`}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>{fmtDateTime(e.occurred_at)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="section">
        <div className="stitle">Konton</div>
        <div className="panel">
          {companyRows.length === 0 ? (
            <div className="empty">
              <div className="et">Inga konton ännu</div>
            </div>
          ) : (
            companyRows.map((c) => {
              const calls = callsByUser.get(c.user_id);
              return (
                <div className="status-line" key={c.user_id} style={{ padding: "14px 18px", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{c.company_name || "(inget företag skapat)"}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>{c.email}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                      Registrerad {fmtDate(c.user_created_at)}
                    </div>
                    {calls && (calls.calls_today > 0 || calls.calls_7d > 0) && (
                      <div
                        style={{
                          fontSize: 11,
                          marginTop: 4,
                          color: calls.calls_today >= 15 ? "var(--crit)" : "var(--muted)",
                        }}
                      >
                        {calls.calls_today} kvittotolkningar idag · {calls.calls_7d} senaste 7 dagarna
                        {calls.calls_today >= 15 && " — ovanligt högt"}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
