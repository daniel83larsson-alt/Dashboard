import { requireCompanyContext } from "@/lib/company";
import type { BasAccount, Voucher, VoucherLine } from "@/lib/supabase-types";
import { ManualVoucherForm } from "./manual-form";
import { CorrectButton } from "./correct-button";

export const dynamic = "force-dynamic";

const fmt = (n: number) =>
  n.toLocaleString("sv-SE", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " kr";

type VoucherWithLines = Voucher & { voucher_lines: VoucherLine[] };

export default async function TransaktionerPage() {
  const { supabase, companyId, fiscalYear } = await requireCompanyContext();

  const { data: accounts } = await supabase.from("bas_accounts").select("*").order("code");
  const { data: vouchers } = await supabase
    .from("vouchers")
    .select("*, voucher_lines(*)")
    .eq("fiscal_year_id", fiscalYear.id)
    .order("voucher_number", { ascending: false });

  return (
    <>
      <h1 className="page-title">Transaktioner</h1>
      <div className="page-desc">
        Alla bokförda verifikat för {companyId ? "innevarande räkenskapsår" : ""}. Kvitton
        bokförs automatiskt hit, eller lägg till manuellt. Bokförda poster kan inte raderas —
        en felaktig post rättas med en motbokning.
      </div>

      <div className="section panel panel-pad">
        <div className="stitle" style={{ marginBottom: 14 }}>
          Lägg till manuellt
        </div>
        <ManualVoucherForm accounts={(accounts ?? []) as BasAccount[]} />
      </div>

      <div className="section">
        <div className="panel">
          {vouchers && vouchers.length > 0 ? (
            (vouchers as VoucherWithLines[]).map((v) => (
              <div key={v.id} className="status-line" style={{ display: "block", padding: 16 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: 8,
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>
                      <span className="mono">#{v.voucher_number}</span> {v.description}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>{v.voucher_date}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {v.corrects_voucher_id && <span className="badge bwarn">Rättelse</span>}
                    {v.corrected_by_voucher_id ? (
                      <span className="badge bneutral">Rättad</span>
                    ) : (
                      <CorrectButton voucherId={v.id} />
                    )}
                  </div>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <tbody>
                      {v.voucher_lines.map((line) => (
                        <tr key={line.id}>
                          <td className="mono" style={{ border: "none", padding: "4px 8px" }}>
                            {line.account_code}
                          </td>
                          <td
                            className="mono amt-pos"
                            style={{ border: "none", padding: "4px 8px", textAlign: "right" }}
                          >
                            {Number(line.debit) > 0 ? fmt(Number(line.debit)) : ""}
                          </td>
                          <td
                            className="mono"
                            style={{ border: "none", padding: "4px 8px", textAlign: "right" }}
                          >
                            {Number(line.credit) > 0 ? fmt(Number(line.credit)) : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          ) : (
            <div className="empty">
              <div className="et">Inga verifikat ännu</div>
              <div className="es">Lägg till en manuellt ovan eller bokför ett kvitto.</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
