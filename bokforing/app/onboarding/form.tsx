"use client";

import { useActionState } from "react";
import { createCompany, type OnboardingState } from "./actions";

const initialState: OnboardingState = { message: "" };

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(createCompany, initialState);

  return (
    <form action={formAction}>
      <div className="field">
        <label htmlFor="name">Företagsnamn</label>
        <input id="name" name="name" type="text" placeholder="T.ex. Larsson Konsult" required />
      </div>
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Skapar…" : "Kom igång"}
      </button>
      {state.message && (
        <div className="callout error" aria-live="polite">
          {state.message}
        </div>
      )}
    </form>
  );
}
