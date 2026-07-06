import { requireCompanyContext } from "@/lib/company";
import type { Voucher, VoucherLine } from "@/lib/supabase/types";

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

  const { data: monthVouchers } = await supabase
    .from("vouchers")
    .select("*, voucher_lines(*)")
    .eq("fiscal_year_id", fiscalYear.id)
    .gte("voucher_date", monthStart)
    .lte("voucher_date", monthEnd);

  let intakter = 0;
  let kostnader = 0;
  for (const v of (monthVouchers ?? []) as (Voucher & { voucher_lines: VoucherLine[] })[]) {
    for (const line of v.voucher_lines) {
      if (line.account_code.startsWith("3")) intakter += Number(line.credit);
      if (["4", "5", "6"].includes(line.account_code[0])) kostnader += Number(line.debit);
    }
  }
  const resultat = intakter - kostnader;

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
        </div>
        <div className="card">
          <div className="k">Kostnader</div>
          <div className="v mono">{fmt(kostnader)}</div>
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
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{v.voucher_date}</div>
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
