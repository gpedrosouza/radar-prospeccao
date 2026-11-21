import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import * as radiusSearchService from "@/server/services/radius-search.service";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  lat:     z.coerce.number().min(-90).max(90),
  lng:     z.coerce.number().min(-180).max(180),
  raio_km: z.coerce.number().positive().max(500),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = QuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams)
  );
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_params", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { lat, lng, raio_km } = parsed.data;

  try {
    const cities = await radiusSearchService.getRadiusCities(lat, lng, raio_km);
    return Response.json({ cities, total: cities.length });
  } catch (err) {
    if (err instanceof radiusSearchService.InvalidGeoParamsError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
