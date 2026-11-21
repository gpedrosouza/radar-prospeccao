import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { searchPlaces } from "@/server/services/places-search.service";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  lat:     z.coerce.number().min(-90).max(90),
  lng:     z.coerce.number().min(-180).max(180),
  raio_km: z.coerce.number().positive().max(50),
  keyword: z.string().default(""),
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
      { status: 422 }
    );
  }

  const { lat, lng, raio_km, keyword } = parsed.data;

  try {
    const places = await searchPlaces({ lat, lng, raioKm: raio_km, keyword });
    return Response.json({ places, total: places.length });
  } catch (err) {
    if (err instanceof Error && /células.*máximo/i.test(err.message)) {
      return Response.json({ error: err.message }, { status: 422 });
    }
    throw err;
  }
}
