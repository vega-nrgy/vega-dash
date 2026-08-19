import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(_req: Request, ctx: RouteContext<"/api/stations/[scno]/rating">) {
  const { scno } = await ctx.params;
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("station_places_cache")
    .select("rating, rating_source")
    .eq("station_id", scno)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rating: data?.rating ?? null, rating_source: data?.rating_source ?? null });
}

export async function PUT(req: Request, ctx: RouteContext<"/api/stations/[scno]/rating">) {
  const { scno } = await ctx.params;
  const body = await req.json();
  const { rating } = body as { rating?: number | null };

  if (rating != null && (typeof rating !== "number" || rating < 0 || rating > 5)) {
    return NextResponse.json({ error: "rating must be a number between 0 and 5" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("station_places_cache").upsert({
    station_id: scno,
    rating: rating ?? null,
    rating_source: "manual",
    refreshed_at: new Date().toISOString(),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rating: rating ?? null });
}
