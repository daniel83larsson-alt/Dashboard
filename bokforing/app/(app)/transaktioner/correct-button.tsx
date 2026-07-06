"use client";

import { useTransition } from "react";
import { correctVoucher } from "./actions";

export function CorrectButton({ voucherId }: { voucherId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      className="btn secondary small"
      disabled={isPending}
      onClick={() => {
        if (!confirm("Boka en rättelsepost som vänder denna transaktion? Originalet raderas inte.")) {
          return;
        }
        startTransition(() => {
          correctVoucher(voucherId).catch((e) => alert(e.message));
        });
      }}
    >
      {isPending ? "Rättar…" : "Rätta"}
    </button>
  );
}
