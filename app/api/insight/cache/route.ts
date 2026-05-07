import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

const INSIGHTS_JSON_PATH = path.join(process.cwd(), "public", "data", "insights.json");

type CachedInsight = {
  insight: string;
  generated_at: string;
  summary?: string;
  legend_keywords?: string[];
  era?: string;
  tradition_type?: string;
  evidence?: string[];
};

type InsightsCache = Record<string, CachedInsight>;

function buildSpotCacheKey(spotId: string) {
  return `spot:${spotId}`;
}

async function readInsightsCache(): Promise<InsightsCache> {
  try {
    const raw = await readFile(INSIGHTS_JSON_PATH, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as InsightsCache;
  } catch {
    return {};
  }
}

export async function GET(request: NextRequest) {
  const cache = await readInsightsCache();
  const name = request.nextUrl.searchParams.get("name")?.trim();
  const spotId = request.nextUrl.searchParams.get("spotId")?.trim();

  if (!name && !spotId) {
    return NextResponse.json({ insights: cache });
  }

  const spotInsight =
    (spotId ? cache[buildSpotCacheKey(spotId)] : undefined) ?? (name ? cache[name] : undefined);
  if (!spotInsight) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json(spotInsight);
}
