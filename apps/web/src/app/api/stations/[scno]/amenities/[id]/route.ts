import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function PATCH(
  req: Request,
  ctx: RouteContext<"/api/stations/[scno]/amenities/[id]">
) {
  const { scno, id } = await ctx.params;
  const body = await req.json();
  const { name, category, distance_m, rating } = body as {
    name?: string;
    category?: string | null;
    distance_m?: number | null;
    rating?: number | null;
  };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name !== undefined) patch.name = name;
  if (category !== undefined) patch.category = category;
  if (distance_m !== undefined) patch.distance_m = distance_m;
  if (rating !== undefined) patch.rating = rating;

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("station_nearby_places")
    .update(patch)
    .eq("id", id)
    .eq("station_id", scno)
    .select("id, name, category, distance_m, rating, source")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  _req: Request,
  ctx: RouteContext<"/api/stations/[scno]/amenities/[id]">
) {
  const { scno, id } = await ctx.params;
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("station_nearby_places")
    .delete()
    .eq("id", id)
    .eq("station_id", scno);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
