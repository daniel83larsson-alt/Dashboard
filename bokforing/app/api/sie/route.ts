import { NextResponse } from "next/server";
import { requireCompanyContext } from "@/lib/company";
import { buildSie4 } from "@/lib/sie";
import type { BasAccount, Voucher, VoucherLine } from "@/lib/supabase-types";

export async function GET() {
  const { supabase, companyId, companyName, fiscalYear } = await requireCompanyContext();

  const { data: accounts } = await supabase.from("bas_accounts").select("*").order("code");
  const { data: vouchers } = await supabase
    .from("vouchers")
    .select("*, voucher_lines(*)")
    .eq("company_id", companyId)
    .eq("fiscal_year_id", fiscalYear.id);

  const linesByVoucher = new Map<string, VoucherLine[]>();
  for (const v of (vouchers ?? []) as (Voucher & { voucher_lines: VoucherLine[] })[]) {
    linesByVoucher.set(v.id, v.voucher_lines);
  }

  const sie = buildSie4({
    companyName,
    fiscalYear,
    accounts: (accounts ?? []) as BasAccount[],
    vouchers: (vouchers ?? []) as Voucher[],
    linesByVoucher,
  });

  return new NextResponse(sie, {
    headers: {
      "Content-Type": "text/plain; charset=iso-8859-1",
      "Content-Disposition": `attachment; filename="bokforing_${fiscalYear.starts_on}.sie"`,
    },
  });
}
