import { NextResponse } from "next/server";
import { requireCompanyContext } from "@/lib/company";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Ingen fil bifogad." }, { status: 400 });
  }
  if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
    return NextResponse.json({ error: "Endast bilder eller PDF stöds." }, { status: 400 });
  }
  const MAX_BYTES = 10 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Filen är för stor (max 10 MB)." }, { status: 400 });
  }

  const { supabase, companyId, user } = await requireCompanyContext();

  const path = `${companyId}/${crypto.randomUUID()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from("receipts").upload(path, file, {
    contentType: file.type,
  });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: receipt, error: insertError } = await supabase
    .from("receipts")
    .insert({ company_id: companyId, storage_path: path, uploaded_by: user.id })
    .select("*")
    .single();

  if (insertError || !receipt) {
    return NextResponse.json({ error: "Kunde inte spara kvittot." }, { status: 500 });
  }

  return NextResponse.json({ receipt });
}
