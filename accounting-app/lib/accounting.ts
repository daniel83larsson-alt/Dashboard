// Core double-entry logic. This is the only place that decides which BAS
// accounts get debited/credited, so the moms split and the offsetting
// bank posting can never drift out of sync with each other.

export type EntryKind = "kostnad" | "intakt" | "eget_uttag" | "eget_insattning";

export interface VoucherLineInput {
  account_code: string;
  debit: number;
  credit: number;
  vat_rate: number | null;
}

export interface SimpleEntryInput {
  kind: EntryKind;
  accountCode: string;
  grossAmount: number;
  vatRate: number; // 0, 6, 12 or 25
}

const BANK_ACCOUNT = "1930";
const OUTGOING_VAT_ACCOUNT = "2611";
const INCOMING_VAT_ACCOUNT = "2641";
const OWN_WITHDRAWAL_ACCOUNT = "2013";
const OWN_DEPOSIT_ACCOUNT = "2018";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Turns a single "I paid X for this" / "I got paid X for this" entry into
 * a balanced set of voucher lines, splitting out moms and posting the
 * offsetting side against the bank account. Equity movements (owner
 * withdrawals/deposits) never carry moms and skip the split entirely.
 */
export function buildVoucherLines(input: SimpleEntryInput): VoucherLineInput[] {
  const gross = round2(input.grossAmount);

  if (input.kind === "eget_uttag") {
    return [
      { account_code: OWN_WITHDRAWAL_ACCOUNT, debit: gross, credit: 0, vat_rate: null },
      { account_code: BANK_ACCOUNT, debit: 0, credit: gross, vat_rate: null },
    ];
  }
  if (input.kind === "eget_insattning") {
    return [
      { account_code: BANK_ACCOUNT, debit: gross, credit: 0, vat_rate: null },
      { account_code: OWN_DEPOSIT_ACCOUNT, debit: 0, credit: gross, vat_rate: null },
    ];
  }

  const vatRate = input.vatRate ?? 0;
  const net = vatRate > 0 ? round2(gross / (1 + vatRate / 100)) : gross;
  const vat = round2(gross - net);

  if (input.kind === "kostnad") {
    const lines: VoucherLineInput[] = [
      { account_code: input.accountCode, debit: net, credit: 0, vat_rate: vatRate || null },
    ];
    if (vat > 0) {
      lines.push({ account_code: INCOMING_VAT_ACCOUNT, debit: vat, credit: 0, vat_rate: vatRate });
    }
    lines.push({ account_code: BANK_ACCOUNT, debit: 0, credit: gross, vat_rate: null });
    return lines;
  }

  // intakt
  const lines: VoucherLineInput[] = [
    { account_code: BANK_ACCOUNT, debit: gross, credit: 0, vat_rate: null },
  ];
  if (vat > 0) {
    lines.push({ account_code: OUTGOING_VAT_ACCOUNT, debit: 0, credit: vat, vat_rate: vatRate });
  }
  lines.push({ account_code: input.accountCode, debit: 0, credit: net, vat_rate: vatRate || null });
  return lines;
}

/** A correcting voucher exactly reverses every line of the original. */
export function reverseLines(lines: VoucherLineInput[]): VoucherLineInput[] {
  return lines.map((l) => ({
    account_code: l.account_code,
    debit: l.credit,
    credit: l.debit,
    vat_rate: l.vat_rate,
  }));
}

export function currentFiscalYearBounds(startMonth: number, today = new Date()) {
  const year =
    today.getMonth() + 1 >= startMonth ? today.getFullYear() : today.getFullYear() - 1;
  const starts = new Date(Date.UTC(year, startMonth - 1, 1));
  const ends = new Date(Date.UTC(year + 1, startMonth - 1, 0));
  return { starts_on: starts.toISOString().slice(0, 10), ends_on: ends.toISOString().slice(0, 10) };
}
