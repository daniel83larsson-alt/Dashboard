import type { BasAccount, Voucher, VoucherLine } from "./supabase-types";

interface SieInput {
  companyName: string;
  fiscalYear: { starts_on: string; ends_on: string };
  accounts: BasAccount[];
  vouchers: Voucher[];
  linesByVoucher: Map<string, VoucherLine[]>;
}

const compact = (isoDate: string) => isoDate.replaceAll("-", "");

export function buildSie4(input: SieInput): string {
  const lines: string[] = [];
  lines.push("#FLAGGA 0");
  lines.push('#PROGRAM "Bokforing app" 1.0');
  lines.push("#FORMAT PC8");
  lines.push(`#GEN ${compact(new Date().toISOString().slice(0, 10))}`);
  lines.push("#SIETYP 4");
  lines.push(`#FNAMN "${input.companyName}"`);
  lines.push(
    `#RAR 0 ${compact(input.fiscalYear.starts_on)} ${compact(input.fiscalYear.ends_on)}`
  );

  for (const account of input.accounts) {
    lines.push(`#KONTO ${account.code} "${account.name}"`);
  }
  lines.push("");

  const sorted = [...input.vouchers].sort((a, b) => a.voucher_number - b.voucher_number);
  for (const voucher of sorted) {
    const voucherLines = input.linesByVoucher.get(voucher.id) ?? [];
    lines.push(
      `#VER A ${voucher.voucher_number} ${compact(voucher.voucher_date)} "${voucher.description}"`
    );
    lines.push("{");
    for (const line of voucherLines) {
      const amount = line.debit > 0 ? line.debit : -line.credit;
      lines.push(`  #TRANS ${line.account_code} {} ${amount.toFixed(2)}`);
    }
    lines.push("}");
  }

  return lines.join("\n") + "\n";
}
