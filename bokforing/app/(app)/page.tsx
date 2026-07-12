import { requireCompanyContext } from "@/lib/company";
import type { BasAccount, Voucher, VoucherLine } from "@/lib/supabase-types";

export const dynamic = "force-dynamic";

const fmt = (n: number) =>
  n.toLocaleString("sv-SE", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " kr";

function monthLabel() {
  return new Date().toLocaleDateString("sv-SE", { month: "long", year: "numeric" });
}

export default async function OversiktPage() {
  const { supabase, companyId, fiscalYear } = await requireCompanyContext();

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))
    .toISOString()
    .slice(0, 10);
  const monthEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0))
    .toISOString()
    .slice(0, 10);

  const [{ data: monthVouchers }, { data: accounts }] = await Promise.all([
    supabase
      .from("vouchers")
      .select("*, voucher_lines(*)")
      .eq("fiscal_year_id", fiscalYear.id)
      .gte("voucher_date", monthStart)
      .lte("voucher_date", monthEnd),
    supabase.from("bas_accounts").select("*"),
  ]);
  const accountName = new Map(((accounts ?? []) as BasAccount[]).map((a) => [a.code, a.name]));

  // Revenue accounts (3xxx) normally grow on credit, expense accounts
  // (4-6xxx) normally grow on debit — but a correction voucher (see
  // "Rätta" on Transaktioner) posts the exact reverse, and a second
  // correction reverses that again. Summing only the "normal" side meant
  // a correction's reversal was silently dropped instead of netting out,
  // so correcting a transaction and correcting it back doubled it instead
  // of returning to the original amount.
  let intakter = 0;
  let kostnader = 0;
  const intaktByAccount = new Map<string, number>();
  const kostnadByAccount = new Map<string, number>();
  for (const v of (monthVouchers ?? []) as (Voucher & { voucher_lines: VoucherLine[] })[]) {
    for (const line of v.voucher_lines) {
      if (line.account_code.startsWith("3")) {
        const net = Number(line.credit) - Number(line.debit);
        intakter += net;
        intaktByAccount.set(line.account_code, (intaktByAccount.get(line.account_code) ?? 0) + net);
      }
      if (["4", "5", "6"].includes(line.account_code[0])) {
        const net = Number(line.debit) - Number(line.credit);
        kostnader += net;
        kostnadByAccount.set(line.account_code, (kostnadByAccount.get(line.account_code) ?? 0) + net);
      }
    }
  }
  const resultat = intakter - kostnader;

  // Fully netted-out accounts (e.g. booked then corrected within the same
  // month) shouldn't clutter the breakdown with a 0 kr line.
  const toBreakdown = (m: Map<string, number>) =>
    [...m.entries()]
      .filter(([, net]) => Math.round(net) !== 0)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .map(([code, net]) => ({ code, name: accountName.get(code) ?? code, net }));
  const intaktBreakdown = toBreakdown(intaktByAccount);
  const kostnadBreakdown = toBreakdown(kostnadByAccount);

  const { count: obehandlade } = await supabase
    .from("receipts")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .is("voucher_id", null);

  const { data: recent } = await supabase
    .from("vouchers")
    .select("*")
    .eq("company_id", companyId)
    .order("voucher_number", { ascending: false })
    .limit(5);

  return (
    <>
      <h1 className="page-title">Översikt</h1>
      <div className="page-desc">{monthLabel()}</div>
      <div className="cards">
        <div className="card">
          <div className="k">Intäkter</div>
          <div className="v pos mono">{fmt(intakter)}</div>
          {intaktBreakdown.length > 0 && (
            <details style={{ marginTop: 10 }}>
              <summary style={{ fontSize: 11, color: "var(--muted)", cursor: "pointer" }}>
                Visa konton ({intaktBreakdown.length})
              </summary>
              <div style={{ marginTop: 8 }}>
                {intaktBreakdown.map((row) => (
                  <div
                    key={row.code}
                    style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, padding: "4px 0" }}
                  >
                    <span style={{ color: "var(--muted)" }}>
                      {row.code} — {row.name}
                    </span>
                    <span className="mono">{fmt(row.net)}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
        <div className="card">
          <div className="k">Kostnader</div>
          <div className="v mono">{fmt(kostnader)}</div>
          {kostnadBreakdown.length > 0 && (
            <details style={{ marginTop: 10 }}>
              <summary style={{ fontSize: 11, color: "var(--muted)", cursor: "pointer" }}>
                Visa konton ({kostnadBreakdown.length})
              </summary>
              <div style={{ marginTop: 8 }}>
                {kostnadBreakdown.map((row) => (
                  <div
                    key={row.code}
                    style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, padding: "4px 0" }}
                  >
                    <span style={{ color: "var(--muted)" }}>
                      {row.code} — {row.name}
                    </span>
                    <span className="mono">{fmt(row.net)}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
        <div className="card">
          <div className="k">Resultat</div>
          <div className={`v mono ${resultat >= 0 ? "pos" : "neg"}`}>{fmt(resultat)}</div>
        </div>
        <div className="card">
          <div className="k">Obehandlade kvitton</div>
          <div className={`v mono ${(obehandlade ?? 0) > 0 ? "neg" : ""}`}>{obehandlade ?? 0}</div>
        </div>
      </div>
      <div className="section">
        <div className="stitle">Senaste verifikat</div>
        <div className="panel">
          {recent && recent.length > 0 ? (
            recent.map((v) => (
              <div className="status-line" key={v.id} style={{ padding: "14px 18px" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    #{v.voucher_number} {v.description}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>{v.voucher_date}</div>
                </div>
              </div>
            ))
          ) : (
            <div className="empty">
              <div className="et">Inga verifikat ännu</div>
              <div className="es">Ladda upp ett kvitto eller lägg till en transaktion manuellt.</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
