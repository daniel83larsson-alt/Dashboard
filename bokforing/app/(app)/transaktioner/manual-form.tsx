"use client";

import { useActionState, useState } from "react";
import { createManualVoucher, type VoucherFormState } from "./actions";
import type { BasAccount } from "@/lib/supabase-types";

const initialState: VoucherFormState = { message: "" };
const today = () => new Date().toISOString().slice(0, 10);

export function ManualVoucherForm({ accounts }: { accounts: BasAccount[] }) {
  const [state, formAction, pending] = useActionState(createManualVoucher, initialState);
  const [kind, setKind] = useState<"kostnad" | "intakt" | "eget_uttag" | "eget_insattning">(
    "kostnad"
  );
  const needsAccount = kind === "kostnad" || kind === "intakt";
  const relevantAccounts = accounts.filter((a) =>
    kind === "intakt" ? a.code.startsWith("3") || a.code === "8310" : !a.code.startsWith("3")
  );

  return (
    <form action={formAction} key={state.message ? "retry" : "clean"}>
      <div className="form-row">
        <div className="field">
          <label htmlFor="kind">Typ</label>
          <select id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="kostnad">Kostnad</option>
            <option value="intakt">Intäkt</option>
            <option value="eget_uttag">Eget uttag</option>
            <option value="eget_insattning">Eget insättning</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="description">Beskrivning</label>
          <input id="description" name="description" placeholder="T.ex. Konsultarvode" required />
        </div>
        <div className="field">
          <label htmlFor="voucherDate">Datum</label>
          <input id="voucherDate" name="voucherDate" type="date" defaultValue={today()} required />
        </div>
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="grossAmount">Belopp {needsAccount ? "(inkl. moms)" : ""}</label>
          <input
            id="grossAmount"
            name="grossAmount"
            className="mono"
            type="number"
            step="0.01"
            placeholder="0"
            required
          />
        </div>
        {needsAccount && (
          <>
            <div className="field">
              <label htmlFor="accountCode">Konto</label>
              <select id="accountCode" name="accountCode" required>
                <option value="">Välj konto…</option>
                {relevantAccounts.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.code} — {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="vatRate">Moms</label>
              <select id="vatRate" name="vatRate" defaultValue="25">
                <option value="0">0%</option>
                <option value="6">6%</option>
                <option value="12">12%</option>
                <option value="25">25%</option>
              </select>
            </div>
          </>
        )}
      </div>
      <button className="btn small" type="submit" disabled={pending}>
        {pending ? "Bokför…" : "Bokför"}
      </button>
      {state.message && (
        <div className="callout error" aria-live="polite" style={{ marginTop: 12 }}>
          {state.message}
        </div>
      )}
    </form>
  );
}
