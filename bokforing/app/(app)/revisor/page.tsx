import { requireCompanyContext } from "@/lib/company";
import type { Voucher, VoucherLine } from "@/lib/supabase-types";

export const dynamic = "force-dynamic";

const fmt = (n: number) =>
  n.toLocaleString("sv-SE", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " kr";

export default async function RevisorPage() {
  const { supabase, companyId, fiscalYear } = await requireCompanyContext();

  const { data: vouchers } = await supabase
    .from("vouchers")
    .select("*, voucher_lines(*)")
    .eq("company_id", companyId)
    .eq("fiscal_year_id", fiscalYear.id);

  // Same netting as Översikt — a correction voucher reverses debit/credit
  // on the original line, and must be subtracted, not just ignored, or a
  // corrected-and-recorrected transaction gets counted twice.
  let intakter = 0;
  let kostnader = 0;
  for (const v of (vouchers ?? []) as (Voucher & { voucher_lines: VoucherLine[] })[]) {
    for (const line of v.voucher_lines) {
      if (line.account_code.startsWith("3")) intakter += Number(line.credit) - Number(line.debit);
      if (["4", "5", "6"].includes(line.account_code[0])) kostnader += Number(line.debit) - Number(line.credit);
    }
  }

  return (
    <>
      <h1 className="page-title">Underlag till revisorn</h1>
      <div className="page-desc">
        Räkenskapsår {fiscalYear.starts_on} – {fiscalYear.ends_on}. Ladda ner en SIE4-fil med
        hela periodens bokföring.
      </div>
      <div className="cards cards-3">
        <div className="card">
          <div className="k">Verifikat</div>
          <div className="v mono">{vouchers?.length ?? 0}</div>
        </div>
        <div className="card">
          <div className="k">Intäkter</div>
          <div className="v pos mono">{fmt(intakter)}</div>
        </div>
        <div className="card">
          <div className="k">Kostnader</div>
          <div className="v mono">{fmt(kostnader)}</div>
        </div>
      </div>
      <div className="panel panel-pad section">
        <a className="btn small" href="/api/sie" download style={{ display: "inline-block", width: "auto" }}>
          Ladda ner SIE-fil
        </a>
      </div>
      <div className="callout">
        <span className="eyebrow">Kommande</span>
        Att bjuda in en revisor med egen inloggning (läsbehörighet till din bokföring) är
        inte byggt ännu — kräver en ny tabell i schema.sql när det blir aktuellt.
      </div>
    </>
  );
}
