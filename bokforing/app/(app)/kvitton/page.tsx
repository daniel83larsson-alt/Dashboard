import { requireCompanyContext } from "@/lib/company";
import type { BasAccount, Receipt } from "@/lib/supabase-types";
import { ReceiptsClient } from "./receipts-client";

export const dynamic = "force-dynamic";

export default async function KvittonPage() {
  const { supabase, companyId } = await requireCompanyContext();

  const { data: receipts } = await supabase
    .from("receipts")
    .select("*")
    .eq("company_id", companyId)
    .order("uploaded_at", { ascending: false });

  const withUrls = await Promise.all(
    ((receipts ?? []) as Receipt[]).map(async (r) => {
      const { data } = await supabase.storage
        .from("receipts")
        .createSignedUrl(r.storage_path, 60 * 60);
      return { ...r, thumbUrl: data?.signedUrl ?? null };
    })
  );

  const { data: accounts } = await supabase.from("bas_accounts").select("*").order("code");

  return (
    <>
      <h1 className="page-title">Kvitton</h1>
      <div className="page-desc">
        Ladda upp ett kvitto så tolkar AI:n det automatiskt — du bekräftar innan det bokförs.
      </div>
      <ReceiptsClient
        initialReceipts={withUrls}
        accounts={(accounts ?? []) as BasAccount[]}
      />
    </>
  );
}
