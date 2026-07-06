import { NextResponse } from "next/server";
import { requireCompanyContext } from "@/lib/company";
import { parseReceiptWithAI } from "@/lib/ai-receipt";
import type { BasAccount } from "@/lib/supabase-types";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, companyId } = await requireCompanyContext();

  const { data: receipt } = await supabase
    .from("receipts")
    .select("*")
    .eq("id", id)
    .eq("company_id", companyId)
    .single();

  if (!receipt) {
    return NextResponse.json({ error: "Kvittot hittades inte." }, { status: 404 });
  }

  const { data: fileBlob, error: downloadError } = await supabase.storage
    .from("receipts")
    .download(receipt.storage_path);
  if (downloadError || !fileBlob) {
    return NextResponse.json({ error: "Kunde inte läsa kvittofilen." }, { status: 500 });
  }

  const { data: accounts } = await supabase.from("bas_accounts").select("*").order("code");
  const kontoplan = ((accounts ?? []) as BasAccount[])
    .map((a) => `${a.code} ${a.name}`)
    .join("\n");

  try {
    const buffer = Buffer.from(await fileBlob.arrayBuffer());
    const suggestion = await parseReceiptWithAI(buffer, fileBlob.type, kontoplan);

    await supabase.from("receipts").update({ ai_suggestion: suggestion }).eq("id", id);

    return NextResponse.json({ suggestion });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI-tolkningen misslyckades." },
      { status: 502 }
    );
  }
}
