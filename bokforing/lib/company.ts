import { redirect } from "next/navigation";
import { createClient } from "./supabase-server";
import { currentFiscalYearBounds } from "./accounting";

export async function requireCompanyContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: company } = await supabase
    .from("companies")
    .select("id, name, fiscal_year_start_month")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!company) redirect("/onboarding");

  const bounds = currentFiscalYearBounds(company.fiscal_year_start_month);

  let { data: fiscalYear } = await supabase
    .from("fiscal_years")
    .select("*")
    .eq("company_id", company.id)
    .eq("starts_on", bounds.starts_on)
    .maybeSingle();

  if (!fiscalYear) {
    const { data: created } = await supabase
      .from("fiscal_years")
      .insert({
        company_id: company.id,
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
    companyId: company.id,
    companyName: company.name,
    fiscalYear: fiscalYear!,
  };
}
