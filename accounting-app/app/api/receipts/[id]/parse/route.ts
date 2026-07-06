import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireCompanyContext } from "@/lib/company";
import type { BasAccount } from "@/lib/supabase/types";

interface AiSuggestion {
  beskrivning: string;
  datum: string;
  belopp: number;
  konto: string;
  typ: "kostnad" | "intakt";
  moms: number;
}

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

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "AI-tolkning är inte konfigurerad (ANTHROPIC_API_KEY saknas)." },
      { status: 501 }
    );
  }

  try {
    const buffer = Buffer.from(await fileBlob.arrayBuffer());
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: fileBlob.type as "image/jpeg" | "image/png" | "image/webp",
                data: buffer.toString("base64"),
              },
            },
            {
              type: "text",
              text:
                "Läs kvittot på bilden. Föreslå bokföring för en svensk enskild firma.\n" +
                "Tillgänglig kontoplan:\n" +
                kontoplan +
                '\n\nSvara ENDAST med JSON på formen: {"beskrivning":"leverantörsnamn","datum":"YYYY-MM-DD","belopp":123.45,"konto":"6110","typ":"kostnad","moms":25}\n' +
                "belopp är totalbeloppet inkl. moms. moms är momssatsen i procent (0, 6, 12 eller 25). Gissa rimligt datum om det inte syns tydligt.",
            },
          ],
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Inget textsvar från AI:n.");
    }

    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Kunde inte tolka AI-svaret.");
    const suggestion = JSON.parse(jsonMatch[0]) as AiSuggestion;

    await supabase.from("receipts").update({ ai_suggestion: suggestion }).eq("id", id);

    return NextResponse.json({ suggestion });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI-tolkningen misslyckades." },
      { status: 502 }
    );
  }
}
