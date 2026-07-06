// Hand-written types matching supabase/schema.sql.
// Once the schema is applied to a real project, replace this with
// `npx supabase gen types typescript` output for full accuracy.

export interface BasAccount {
  code: string;
  name: string;
  vat_default: number | null;
}

export interface Company {
  id: string;
  user_id: string;
  name: string;
  fiscal_year_start_month: number;
  created_at: string;
}

export interface FiscalYear {
  id: string;
  company_id: string;
  starts_on: string;
  ends_on: string;
  next_voucher_number: number;
  closed: boolean;
}

export interface Voucher {
  id: string;
  company_id: string;
  fiscal_year_id: string;
  voucher_number: number;
  voucher_date: string;
  description: string;
  corrects_voucher_id: string | null;
  corrected_by_voucher_id: string | null;
  created_by: string;
  created_at: string;
}

export interface VoucherLine {
  id: string;
  voucher_id: string;
  account_code: string;
  debit: number;
  credit: number;
  vat_rate: number | null;
}

export interface Receipt {
  id: string;
  company_id: string;
  storage_path: string;
  uploaded_by: string;
  uploaded_at: string;
  ai_suggestion: {
    beskrivning: string;
    datum: string;
    belopp: number;
    konto: string;
    typ: "kostnad" | "intakt";
  } | null;
  voucher_id: string | null;
}

// Minimal Database shape so @supabase/ssr's generic client typing compiles.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
