import { NextResponse } from "next/server";
import { requireCompanyContext } from "@/lib/company";
import { parseReceiptWithAI } from "@/lib/ai-receipt";
import { logApiCall } from "@/lib/log-api-call";
import type { BasAccount } from "@/lib/supabase-types";

// A real receipt photo (several MB) takes Gemini well over Vercel's default
// serverless timeout to analyze -- verified locally at 20-30s for a 2MB
// image. Without this, the platform kills the function before Gemini
// responds and the browser sees a bare 502 with no application error.
export const maxDuration = 60;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, companyId, user } = await requireCompanyContext();
  logApiCall(supabase, user.id, "receipt_parse");

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
    console.error("Receipt parse error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI-tolkningen misslyckades." },
      { status: 502 }
    );
  }
}
