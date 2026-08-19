import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(_req: Request, ctx: RouteContext<"/api/stations/[scno]/amenities">) {
  const { scno } = await ctx.params;
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("station_nearby_places")
    .select("id, name, category, distance_m, rating, source")
    .eq("station_id", scno)
    .order("distance_m", { ascending: true, nullsFirst: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ amenities: data ?? [] });
}

export async function POST(req: Request, ctx: RouteContext<"/api/stations/[scno]/amenities">) {
  const { scno } = await ctx.params;
  const body = await req.json();
  const { name, category, distance_m, rating } = body as {
    name?: string;
    category?: string | null;
    distance_m?: number | null;
    rating?: number | null;
  };

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("station_nearby_places")
    .insert({
      station_id: scno,
      name,
      category: category ?? null,
      distance_m: distance_m ?? null,
      rating: rating ?? null,
      source: "manual",
      updated_at: new Date().toISOString(),
    })
    .select("id, name, category, distance_m, rating, source")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
