import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { currentFiscalYearBounds } from "./accounting";

export async function requireCompanyContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("company_members")
    .select("company_id, companies(name, fiscal_year_start_month)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/onboarding");

  const company = (
    membership as unknown as {
      company_id: string;
      companies: { name: string; fiscal_year_start_month: number } | null;
    }
  );

  const startMonth = company.companies?.fiscal_year_start_month ?? 1;
  const bounds = currentFiscalYearBounds(startMonth);

  let { data: fiscalYear } = await supabase
    .from("fiscal_years")
    .select("*")
    .eq("company_id", company.company_id)
    .eq("starts_on", bounds.starts_on)
    .maybeSingle();

  if (!fiscalYear) {
    const { data: created } = await supabase
      .from("fiscal_years")
      .insert({
        company_id: company.company_id,
        starts_on: bounds.starts_on,
        ends_on: bounds.ends_on,
      })
      .select("*")
      .single();
    fiscalYear = created;
  }

  return {
    supabase,
    user,
    companyId: company.company_id,
    companyName: company.companies?.name ?? "Mitt företag",
    fiscalYear: fiscalYear!,
  };
}
