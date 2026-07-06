import { requireCompanyContext } from "@/lib/company";
import type { BasAccount, VoucherLine } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

const fmt = (n: number) =>
  n.toLocaleString("sv-SE", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " kr";

export default async function KontonPage() {
  const { supabase, fiscalYear } = await requireCompanyContext();

  const { data: accounts } = await supabase
    .from("bas_accounts")
    .select("*")
    .order("code");

  const { data: vouchers } = await supabase
    .from("vouchers")
    .select("id, voucher_lines(*)")
    .eq("fiscal_year_id", fiscalYear.id);

  const balances = new Map<string, { count: number; debit: number; credit: number }>();
  for (const v of (vouchers ?? []) as { voucher_lines: VoucherLine[] }[]) {
    for (const line of v.voucher_lines) {
      const entry = balances.get(line.account_code) ?? { count: 0, debit: 0, credit: 0 };
      entry.count += 1;
      entry.debit += Number(line.debit);
      entry.credit += Number(line.credit);
      balances.set(line.account_code, entry);
    }
  }

  const rows = ((accounts ?? []) as BasAccount[])
    .map((a) => ({ account: a, balance: balances.get(a.code) }))
    .filter((r) => r.balance);

  return (
    <>
      <h1 className="page-title">Konton</h1>
      <div className="page-desc">BAS-kontoplan med saldo för innevarande räkenskapsår.</div>
      <div className="panel">
        {rows.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Konto</th>
                  <th>Namn</th>
                  <th>Antal poster</th>
                  <th>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ account, balance }) => {
                  const net = (balance!.debit - balance!.credit) * (isBalanceDebitNormal(account.code) ? 1 : -1);
                  return (
                    <tr key={account.code}>
                      <td className="mono">{account.code}</td>
                      <td>{account.name}</td>
                      <td className="mono">{balance!.count}</td>
                      <td className={`mono ${net >= 0 ? "amt-pos" : "amt-neg"}`}>{fmt(Math.abs(net))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <div className="et">Inga konton med aktivitet ännu</div>
            <div className="es">Bokför en transaktion så dyker kontot upp här.</div>
          </div>
        )}
      </div>
    </>
  );
}

// Asset/expense accounts (1xxx, 4-6xxx) grow with debit; liability/equity/
// revenue accounts (2xxx, 3xxx) grow with credit.
function isBalanceDebitNormal(code: string) {
  return ["1", "4", "5", "6", "7"].includes(code[0]);
}
