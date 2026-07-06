"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";

export interface AuthFormState {
  message: string;
}

export async function login(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { message: "Fyll i e-post och lösenord." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { message: "Fel e-post eller lösenord." };
  }

  redirect("/");
}

export async function signup(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { message: "Fyll i e-post och lösenord." };
  }
  if (password.length < 8) {
    return { message: "Lösenordet måste vara minst 8 tecken." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return { message: error.message };
  }

  if (!data.session) {
    return {
      message: "Konto skapat! Kolla din e-post för att bekräfta kontot innan du loggar in.",
    };
  }

  redirect("/onboarding");
}
