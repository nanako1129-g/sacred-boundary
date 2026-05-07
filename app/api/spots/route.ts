import { NextRequest, NextResponse } from "next/server";

import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { ALL_SPOTS } from "@/lib/spots";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 90;
const spotsRequestLog = new Map<string, number[]>();

function parseNumber(value: string | null, fallback: number) {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getClientIp(request: NextRequest): string {
  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    return xForwardedFor.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (spotsRequestLog.get(ip) ?? []).filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    spotsRequestLog.set(ip, recent);
    return true;
  }
  recent.push(now);
  spotsRequestLog.set(ip, recent);
  return false;
}

function respondWithCache(payload: unknown) {
  const response = NextResponse.json(payload);
  response.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  return response;
}

export async function GET(request: NextRequest) {
  const clientIp = getClientIp(request);
  if (isRateLimited(clientIp)) {
    return NextResponse.json(
      { error: "リクエストが多すぎます。少し待って再試行してください。" },
      { status: 429 },
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const minLat = parseNumber(searchParams.get("minLat"), 24);
  const maxLat = parseNumber(searchParams.get("maxLat"), 46);
  const minLon = parseNumber(searchParams.get("minLon"), 123);
  const maxLon = parseNumber(searchParams.get("maxLon"), 146);
  const type = searchParams.get("type");
  const requestedLimit = parseNumber(searchParams.get("limit"), 300);
  const limit = Math.max(20, Math.min(1200, requestedLimit));

  try {
    const supabase = createSupabaseServiceClient();
    let query = supabase
      .from("spots")
      .select("id,name,lat,lon,type")
      .gte("lat", minLat)
      .lte("lat", maxLat)
      .gte("lon", minLon)
      .lte("lon", maxLon)
      .limit(limit);

    if (type === "sacred" || type === "random") {
      query = query.eq("type", type);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    return respondWithCache({
      spots: data ?? [],
      count: data?.length ?? 0,
      source: "supabase",
    });
  } catch {
    const fallback = ALL_SPOTS.filter(
      (spot) =>
        spot.lat >= minLat &&
        spot.lat <= maxLat &&
        spot.lon >= minLon &&
        spot.lon <= maxLon &&
        (type === "sacred" || type === "random" ? spot.type === type : true),
    ).slice(0, limit);

    return respondWithCache({
      spots: fallback,
      count: fallback.length,
      source: "fallback",
    });
  }
}
