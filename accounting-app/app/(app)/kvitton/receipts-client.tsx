"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { BasAccount, Receipt } from "@/lib/supabase/types";
import { confirmReceipt } from "./actions";

type ReceiptWithUrl = Receipt & { thumbUrl: string | null };
type Status = "idle" | "uploading" | "parsing";

const today = () => new Date().toISOString().slice(0, 10);

export function ReceiptsClient({
  initialReceipts,
  accounts,
}: {
  initialReceipts: ReceiptWithUrl[];
  accounts: BasAccount[];
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [parsingId, setParsingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setStatus("uploading");
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/receipts/upload", { method: "POST", body: formData });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Uppladdningen misslyckades.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Uppladdningen misslyckades.");
    } finally {
      setStatus("idle");
    }
  }

  async function handleParse(receiptId: string) {
    setParsingId(receiptId);
    setError(null);
    try {
      const res = await fetch(`/api/receipts/${receiptId}/parse`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "AI-tolkningen misslyckades.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI-tolkningen misslyckades.");
    } finally {
      setParsingId(null);
    }
  }

  return (
    <>
      <div className="section">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf"
          style={{ display: "none" }}
          onChange={handleFileSelected}
        />
        <button
          className="upload-box"
          onClick={() => fileInputRef.current?.click()}
          disabled={status === "uploading"}
        >
          <div className="ut">{status === "uploading" ? "Laddar upp…" : "Ladda upp kvitto"}</div>
          <div className="us">JPG, PNG eller PDF — eller ta en bild direkt med mobilen</div>
        </button>
        {error && (
          <div className="callout error" style={{ marginTop: 12 }}>
            {error}
          </div>
        )}
      </div>

      <div className="section">
        <div className="stitle">Uppladdade kvitton</div>
        <div className="panel">
          {initialReceipts.length === 0 ? (
            <div className="empty">
              <div className="et">Inga kvitton uppladdade</div>
              <div className="es">Klicka ovan för att ladda upp ditt första kvitto.</div>
            </div>
          ) : (
            initialReceipts.map((r) => (
              <ReceiptRow
                key={r.id}
                receipt={r}
                accounts={accounts}
                parsing={parsingId === r.id}
                onParse={() => handleParse(r.id)}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
}

function ReceiptRow({
  receipt,
  accounts,
  parsing,
  onParse,
}: {
  receipt: ReceiptWithUrl;
  accounts: BasAccount[];
  parsing: boolean;
  onParse: () => void;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [form, setForm] = useState(() => ({
    beskrivning: receipt.ai_suggestion?.beskrivning ?? "",
    datum: receipt.ai_suggestion?.datum ?? today(),
    belopp: receipt.ai_suggestion?.belopp ?? 0,
    konto: receipt.ai_suggestion?.konto ?? "",
    typ: receipt.ai_suggestion?.typ ?? "kostnad",
  }));

  async function handleConfirm() {
    setConfirming(true);
    try {
      await confirmReceipt(receipt.id, {
        kind: form.typ,
        accountCode: form.konto,
        grossAmount: Number(form.belopp),
        vatRate: 25,
        voucherDate: form.datum,
        description: form.beskrivning,
      });
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Kunde inte bokföra kvittot.");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="receipt-row">
      {receipt.thumbUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="receipt-thumb" src={receipt.thumbUrl} alt="" />
      )}
      <div className="receipt-info">
        <div className="receipt-name">{receipt.storage_path.split("/").pop()}</div>
        <div className="receipt-meta">
          Uppladdad {new Date(receipt.uploaded_at).toLocaleString("sv-SE")}
        </div>
      </div>

      {receipt.voucher_id ? (
        <span className="badge bpos">Bokförd</span>
      ) : !receipt.ai_suggestion ? (
        <button className="btn small" style={{ marginLeft: "auto" }} onClick={onParse} disabled={parsing}>
          {parsing ? "AI läser kvittot…" : "Tolka med AI"}
        </button>
      ) : (
        <div className="parse-form">
          <div className="ai-tag">
            <span className="dot" /> AI-förslag — kontrollera och justera vid behov
          </div>
          <div className="form-row">
            <div className="field">
              <label>Leverantör / beskrivning</label>
              <input
                value={form.beskrivning}
                onChange={(e) => setForm((f) => ({ ...f, beskrivning: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>Datum</label>
              <input
                type="date"
                value={form.datum}
                onChange={(e) => setForm((f) => ({ ...f, datum: e.target.value }))}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="field">
              <label>Belopp (inkl. moms)</label>
              <input
                className="mono"
                type="number"
                value={form.belopp}
                onChange={(e) => setForm((f) => ({ ...f, belopp: Number(e.target.value) }))}
              />
            </div>
            <div className="field">
              <label>Konto</label>
              <select
                value={form.konto}
                onChange={(e) => setForm((f) => ({ ...f, konto: e.target.value }))}
              >
                <option value="">Välj konto…</option>
                {accounts.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.code} — {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Typ</label>
              <select
                value={form.typ}
                onChange={(e) =>
                  setForm((f) => ({ ...f, typ: e.target.value as "kostnad" | "intakt" }))
                }
              >
                <option value="kostnad">Kostnad</option>
                <option value="intakt">Intäkt</option>
              </select>
            </div>
          </div>
          <button className="btn small" onClick={handleConfirm} disabled={confirming || !form.konto}>
            {confirming ? "Bokför…" : "Bokför"}
          </button>
        </div>
      )}
    </div>
  );
}
