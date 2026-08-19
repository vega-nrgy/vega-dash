import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function PATCH(req: Request, ctx: RouteContext<"/api/stations/[scno]/fleet/[id]">) {
  const { scno, id } = await ctx.params;
  const body = await req.json();
  const { operator_name, vehicle_class, fleet_size, contact_name, contact_info, notes } = body as {
    operator_name?: string;
    vehicle_class?: string | null;
    fleet_size?: number | null;
    contact_name?: string | null;
    contact_info?: string | null;
    notes?: string | null;
  };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (operator_name !== undefined) patch.operator_name = operator_name;
  if (vehicle_class !== undefined) patch.vehicle_class = vehicle_class;
  if (fleet_size !== undefined) patch.fleet_size = fleet_size;
  if (contact_name !== undefined) patch.contact_name = contact_name;
  if (contact_info !== undefined) patch.contact_info = contact_info;
  if (notes !== undefined) patch.notes = notes;

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("station_fleet_operators")
    .update(patch)
    .eq("id", id)
    .eq("station_id", scno)
    .select("id, operator_name, vehicle_class, fleet_size, contact_name, contact_info, notes")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/stations/[scno]/fleet/[id]">) {
  const { scno, id } = await ctx.params;
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("station_fleet_operators")
    .delete()
    .eq("id", id)
    .eq("station_id", scno);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
