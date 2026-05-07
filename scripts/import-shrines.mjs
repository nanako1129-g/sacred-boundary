import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const DEFAULT_MAX = 1000;
const CHUNK_SIZE = 200;

function loadDotEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    return;
  }
  const raw = readFileSync(envPath, "utf-8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function parseMaxArg() {
  const maxArg = process.argv.find((arg) => arg.startsWith("--max="));
  if (!maxArg) {
    return DEFAULT_MAX;
  }
  const value = Number(maxArg.split("=")[1]);
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_MAX;
  }
  return Math.min(5000, Math.floor(value));
}

function normalizeName(name) {
  return name.replace(/\s+/g, "").toLowerCase();
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function buildOverpassQuery() {
  return `
[out:json][timeout:120];
area["ISO3166-1"="JP"][admin_level=2]->.japan;
(
  node["amenity"="place_of_worship"]["religion"="shinto"]["name"](area.japan);
  way["amenity"="place_of_worship"]["religion"="shinto"]["name"](area.japan);
  relation["amenity"="place_of_worship"]["religion"="shinto"]["name"](area.japan);
);
out center tags;
`;
}

function mapElementToSpot(element) {
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  const name = element.tags?.name?.trim();

  if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  return {
    id: `osm-${element.type}-${element.id}`,
    name,
    lat,
    lon,
    type: "sacred",
    prefecture: null,
    description: "OpenStreetMap (Overpass API) 由来データ",
  };
}

function dedupeSpots(spots) {
  const seen = new Set();
  const result = [];

  for (const spot of spots) {
    const latKey = spot.lat.toFixed(4);
    const lonKey = spot.lon.toFixed(4);
    const key = `${normalizeName(spot.name)}:${latKey}:${lonKey}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(spot);
  }

  return result;
}

async function fetchShrinesFromOverpass(maxCount) {
  const query = buildOverpassQuery();
  let lastErrorMessage = "Overpass API request failed.";
  let responseJson = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "User-Agent": "sacred-boundary-importer/1.0 (contact: local-dev)",
      },
      body: new URLSearchParams({ data: query }).toString(),
    });

    if (response.ok) {
      responseJson = await response.json();
      break;
    }

    const body = await response.text().catch(() => "");
    lastErrorMessage = `Overpass API error: ${response.status} (${endpoint}) ${body.slice(0, 120)}`;
  }

  if (!responseJson) {
    throw new Error(lastErrorMessage);
  }

  const data = responseJson;
  const elements = Array.isArray(data.elements) ? data.elements : [];
  const mapped = elements.map(mapElementToSpot).filter(Boolean);
  const deduped = dedupeSpots(mapped);
  return deduped.slice(0, maxCount);
}

async function upsertSpotsToSupabase(spots) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を .env.local に設定してください。",
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const chunks = chunkArray(spots, CHUNK_SIZE);
  let processed = 0;

  for (const chunk of chunks) {
    const { error } = await supabase.from("spots").upsert(chunk, { onConflict: "id" });
    if (error) {
      throw new Error(`Supabase upsert error: ${error.message}`);
    }
    processed += chunk.length;
    console.log(`upserted ${processed}/${spots.length}`);
  }
}

async function main() {
  loadDotEnvLocal();
  const maxCount = parseMaxArg();
  console.log(`fetching shrines from Overpass... (max=${maxCount})`);
  const spots = await fetchShrinesFromOverpass(maxCount);

  if (!spots.length) {
    console.log("no shrines found; nothing to import");
    return;
  }

  console.log(`fetched ${spots.length} shrines, importing...`);
  await upsertSpotsToSupabase(spots);
  console.log("done: shrine import completed");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "unexpected error");
  process.exit(1);
});
