import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Thin proxy to predict-service (Phase 2+). Until that service exists and a
 * model is trained, every request is recorded as `stub_no_model` — see plan
 * §4/§8 Phase 4. This keeps the right-click UI, endpoint, and table shipping
 * now rather than waiting for the model.
 */
export async function POST(req: Request) {
  const body = await req.json();
  const { lat, lon, chargers, contractedLoadKva } = body as {
    lat: number;
    lon: number;
    chargers?: { label: string; count: number; power_kw: number }[];
    contractedLoadKva?: number;
  };

  if (typeof lat !== "number" || typeof lon !== "number") {
    return NextResponse.json({ error: "lat and lon are required" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  const predictServiceUrl = process.env.PREDICT_SERVICE_URL;
  if (predictServiceUrl) {
    try {
      const res = await fetch(`${predictServiceUrl}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        const prediction = await res.json();
        return NextResponse.json(prediction);
      }
    } catch {
      // Fall through to the stub below — predict-service unavailable.
    }
  }

  const { data, error } = await supabase
    .from("site_predictions")
    .insert({
      lat,
      lon,
      charger_config: chargers?.length ? { chargers } : null,
      contracted_load_kva: contractedLoadKva ?? null,
      status: "stub_no_model",
    })
    .select("id, status")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
