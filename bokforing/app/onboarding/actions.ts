"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { currentFiscalYearBounds } from "@/lib/accounting";

export interface OnboardingState {
  message: string;
}

export async function createCompany(
  _prevState: OnboardingState,
  formData: FormData
): Promise<OnboardingState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return { message: "Ange ett företagsnamn." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .insert({ name, user_id: user.id, fiscal_year_start_month: 1 })
    .select("id")
    .single();

  if (companyError || !company) {
    return { message: "Kunde inte skapa företaget. Försök igen." };
  }

  const bounds = currentFiscalYearBounds(1);
  const { error: fyError } = await supabase.from("fiscal_years").insert({
    company_id: company.id,
    starts_on: bounds.starts_on,
    ends_on: bounds.ends_on,
  });

  if (fyError) {
    return { message: "Företaget skapades men räkenskapsåret kunde inte sättas upp." };
  }

  redirect("/");
}
