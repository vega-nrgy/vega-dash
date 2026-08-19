import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(_req: Request, ctx: RouteContext<"/api/stations/[scno]/fleet">) {
  const { scno } = await ctx.params;
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("station_fleet_operators")
    .select("id, operator_name, vehicle_class, fleet_size, contact_name, contact_info, notes")
    .eq("station_id", scno)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ fleetOperators: data ?? [] });
}

export async function POST(req: Request, ctx: RouteContext<"/api/stations/[scno]/fleet">) {
  const { scno } = await ctx.params;
  const body = await req.json();
  const { operator_name, vehicle_class, fleet_size, contact_name, contact_info, notes } = body as {
    operator_name?: string;
    vehicle_class?: string | null;
    fleet_size?: number | null;
    contact_name?: string | null;
    contact_info?: string | null;
    notes?: string | null;
  };

  if (!operator_name || typeof operator_name !== "string") {
    return NextResponse.json({ error: "operator_name is required" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("station_fleet_operators")
    .insert({
      station_id: scno,
      operator_name,
      vehicle_class: vehicle_class ?? null,
      fleet_size: fleet_size ?? null,
      contact_name: contact_name ?? null,
      contact_info: contact_info ?? null,
      notes: notes ?? null,
    })
    .select("id, operator_name, vehicle_class, fleet_size, contact_name, contact_info, notes")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
