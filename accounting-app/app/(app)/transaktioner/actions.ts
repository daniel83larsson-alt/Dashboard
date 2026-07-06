"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyContext } from "@/lib/company";
import { buildVoucherLines, reverseLines, type EntryKind } from "@/lib/accounting";
import type { VoucherLine } from "@/lib/supabase/types";

export interface VoucherFormState {
  message: string;
}

export async function createManualVoucher(
  _prevState: VoucherFormState,
  formData: FormData
): Promise<VoucherFormState> {
  const kind = String(formData.get("kind")) as EntryKind;
  const accountCode = String(formData.get("accountCode") ?? "");
  const grossAmount = Number(formData.get("grossAmount"));
  const vatRate = Number(formData.get("vatRate") ?? 0);
  const voucherDate = String(formData.get("voucherDate") ?? "");
  const description = String(formData.get("description") ?? "").trim();

  if (!description || !grossAmount || grossAmount <= 0 || !voucherDate) {
    return { message: "Fyll i beskrivning, datum och ett belopp större än 0." };
  }
  if ((kind === "kostnad" || kind === "intakt") && !accountCode) {
    return { message: "Välj ett konto." };
  }

  const { supabase, companyId, fiscalYear } = await requireCompanyContext();

  const lines = buildVoucherLines({ kind, accountCode, grossAmount, vatRate });

  const { error } = await supabase.rpc("create_voucher", {
    p_company_id: companyId,
    p_fiscal_year_id: fiscalYear.id,
    p_voucher_date: voucherDate,
    p_description: description,
    p_lines: lines,
  });

  if (error) {
    return { message: `Kunde inte bokföra: ${error.message}` };
  }

  revalidatePath("/transaktioner");
  revalidatePath("/");
  revalidatePath("/konton");
  return { message: "" };
}

export async function correctVoucher(voucherId: string) {
  const { supabase, companyId, fiscalYear } = await requireCompanyContext();

  const { data: original, error: fetchError } = await supabase
    .from("vouchers")
    .select("*, voucher_lines(*)")
    .eq("id", voucherId)
    .single();

  if (fetchError || !original) {
    throw new Error("Hittade inte verifikatet.");
  }

  const originalLines = (original.voucher_lines as VoucherLine[]).map((l) => ({
    account_code: l.account_code,
    debit: Number(l.debit),
    credit: Number(l.credit),
    vat_rate: l.vat_rate,
  }));

  const { error } = await supabase.rpc("create_voucher", {
    p_company_id: companyId,
    p_fiscal_year_id: fiscalYear.id,
    p_voucher_date: new Date().toISOString().slice(0, 10),
    p_description: `Rättelse av #${original.voucher_number}: ${original.description}`,
    p_lines: reverseLines(originalLines),
    p_corrects_voucher_id: voucherId,
  });

  if (error) {
    throw new Error(`Kunde inte rätta verifikatet: ${error.message}`);
  }

  revalidatePath("/transaktioner");
  revalidatePath("/");
  revalidatePath("/konton");
}
