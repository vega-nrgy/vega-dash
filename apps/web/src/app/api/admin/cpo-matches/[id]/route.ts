import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/** Approve or reject a single CPO-match proposal.
 * Approve: sets stations.cpo_brand to the (admin-editable) brand name — never
 * touches stations.operator, which stays the raw TSPDCL registrant (see migration
 * 0012 for the rationale). Reject: marks the proposal rejected, no station change. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/admin/cpo-matches/[id]">) {
  const { id } = await ctx.params;
  const body = await req.json();
  const { action, cpoBrand } = body as { action?: "approve" | "reject"; cpoBrand?: string };

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
  }
  if (action === "approve" && (!cpoBrand || !cpoBrand.trim())) {
    return NextResponse.json({ error: "cpoBrand is required to approve" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  const { data: proposal, error: proposalError } = await supabase
    .from("station_cpo_match_proposals")
    .select("id, station_id, status")
    .eq("id", id)
    .maybeSingle();

  if (proposalError) return NextResponse.json({ error: proposalError.message }, { status: 500 });
  if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  if (proposal.status !== "pending") {
    return NextResponse.json({ error: `Proposal already ${proposal.status}` }, { status: 409 });
  }

  if (action === "approve") {
    const { error: stationError } = await supabase
      .from("stations")
      .update({ cpo_brand: cpoBrand!.trim(), cpo_brand_source: "statiq_matched", updated_at: new Date().toISOString() })
      .eq("unique_scno", proposal.station_id);
    if (stationError) return NextResponse.json({ error: stationError.message }, { status: 500 });
  }

  const { error: updateError } = await supabase
    .from("station_cpo_match_proposals")
    .update({ status: action === "approve" ? "approved" : "rejected", reviewed_at: new Date().toISOString() })
    .eq("id", id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ ok: true, status: action === "approve" ? "approved" : "rejected" });
}
