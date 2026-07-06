"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyContext } from "@/lib/company";
import { buildVoucherLines, type EntryKind } from "@/lib/accounting";

export async function confirmReceipt(
  receiptId: string,
  input: {
    kind: EntryKind;
    accountCode: string;
    grossAmount: number;
    vatRate: number;
    voucherDate: string;
    description: string;
  }
) {
  const { supabase, companyId, fiscalYear } = await requireCompanyContext();

  const lines = buildVoucherLines(input);

  const { data: voucherId, error } = await supabase.rpc("create_voucher", {
    p_company_id: companyId,
    p_fiscal_year_id: fiscalYear.id,
    p_voucher_date: input.voucherDate,
    p_description: input.description,
    p_lines: lines,
  });

  if (error) {
    throw new Error(`Kunde inte bokföra kvittot: ${error.message}`);
  }

  await supabase.from("receipts").update({ voucher_id: voucherId }).eq("id", receiptId);

  revalidatePath("/kvitton");
  revalidatePath("/transaktioner");
  revalidatePath("/");
  revalidatePath("/konton");
}
