import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/** Lists CPO-match proposals for the /admin/cpo-matches review page. Defaults to
 * pending only — see supabase/migrations/0012_cpo_match_review.sql for why these
 * always need human review rather than auto-applying. */
export async function GET(req: Request) {
  const status = new URL(req.url).searchParams.get("status") ?? "pending";
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("station_cpo_match_proposals")
    .select(
      `
      id, distance_m, status, reviewed_at, created_at,
      stations:station_id ( unique_scno, name, operator, cpo_brand, district, latitude, longitude ),
      external_cpo_stations:external_station_id ( name, address, latitude, longitude, source )
    `
    )
    .eq("status", status)
    .order("distance_m", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ proposals: data ?? [] });
}
