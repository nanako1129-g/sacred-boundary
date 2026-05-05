import { NextRequest, NextResponse } from "next/server";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const GEMINI_MODELS = [
  "gemini-flash-lite-latest",
  "gemini-2.5-flash-lite-preview-09-2025",
  "gemini-2.0-flash-exp",
];
const GEMINI_ENDPOINT_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const WIKI_SUMMARY_MAX_LENGTH = 1500;
const GEMINI_TIMEOUT_MS = 30_000;
const INSIGHTS_JSON_PATH = path.join(process.cwd(), "public", "data", "insights.json");

const requestLog = new Map<string, number[]>();

type InsightRequestBody = {
  name?: string;
  elevation?: number;
  geomagF?: number;
  wikiSummary?: string;
};

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

type GeneratedInsight = {
  insight: string;
  summary: string;
  legend_keywords: string[];
  era: string;
  tradition_type: string;
  evidence: string[];
};

function extractLegendKeywordsFromText(text: string): string[] {
  const seeds = [
    "異界",
    "黄泉",
    "龍",
    "結界",
    "修験",
    "神話",
    "霊山",
    "神域",
    "鎮魂",
    "聖地",
    "境界",
  ];
  return seeds.filter((keyword) => text.includes(keyword)).slice(0, 6);
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

function normalizeGeneratedInsight(raw: Partial<GeneratedInsight> & { insight: string }): GeneratedInsight {
  const compact = (value: string) => value.replace(/\s+/g, " ").trim();
  return {
    insight: raw.insight.trim(),
    summary: compact(raw.summary ?? raw.insight),
    legend_keywords: (raw.legend_keywords ?? []).filter(Boolean).slice(0, 6),
    era: compact(raw.era ?? "不詳"),
    tradition_type: compact(raw.tradition_type ?? "伝承"),
    evidence: (raw.evidence ?? []).filter(Boolean).slice(0, 5),
  };
}

function parseGeneratedInsight(rawText: string): GeneratedInsight | null {
  const text = rawText.trim();
  const jsonCandidate = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(jsonCandidate) as Partial<GeneratedInsight> & { insight?: string };
    if (!parsed?.insight || typeof parsed.insight !== "string") {
      return null;
    }
    return normalizeGeneratedInsight({
      insight: parsed.insight,
      summary: typeof parsed.summary === "string" ? parsed.summary : undefined,
      legend_keywords: Array.isArray(parsed.legend_keywords)
        ? parsed.legend_keywords.filter((v): v is string => typeof v === "string")
        : [],
      era: typeof parsed.era === "string" ? parsed.era : undefined,
      tradition_type: typeof parsed.tradition_type === "string" ? parsed.tradition_type : undefined,
      evidence: Array.isArray(parsed.evidence)
        ? parsed.evidence.filter((v): v is string => typeof v === "string")
        : [],
    });
  } catch {
    return null;
  }
}

function fallbackGeneratedInsight(rawText: string): GeneratedInsight {
  const text = rawText.trim().replace(/\n{2,}/g, "\n");
  const summaryLine = text.split(/[。.!?\n]/).find((line) => line.trim().length > 0)?.trim();
  return normalizeGeneratedInsight({
    insight: text,
    summary: summaryLine ? `${summaryLine}${summaryLine.endsWith("。") ? "" : "。"}` : "考察を生成しました。",
    legend_keywords: extractLegendKeywordsFromText(text),
    era: "不詳",
    tradition_type: "伝承",
    evidence: ["Wikipedia要約", "標高データ", "地磁気データ"],
  });
}

function buildLocalGeneratedInsight(params: {
  name: string;
  elevation: number;
  geomagF: number;
  wikiSummary: string;
}): GeneratedInsight {
  const geomagDelta = Math.round(Math.abs(params.geomagF - 46000));
  const elevationTone = params.elevation >= 800 ? "高所性が強く" : "地形の起伏が程よく";
  const geomagTone =
    geomagDelta >= 1200
      ? "地磁気の偏差も比較的大きく"
      : "地磁気は平均域に近いものの";
  const shortWiki = params.wikiSummary.slice(0, 120).trim();
  const insight = `${params.name}は${elevationTone}、古くから境界感を抱きやすい場所と考えられます。${geomagTone}、感覚的な「特別さ」を補強していた可能性があります。歴史記述（${shortWiki}）を踏まえると、土地の記憶と自然環境が重なって聖性が語り継がれたと解釈できます。`;
  return normalizeGeneratedInsight({
    insight,
    summary: `${params.name}は地形・地磁気・歴史文脈の重なりで聖地性が強まった可能性があります。`,
    legend_keywords: extractLegendKeywordsFromText(`${params.wikiSummary} ${insight}`),
    era: "不詳",
    tradition_type: "信仰史",
    evidence: ["Wikipedia要約", "標高データ", "地磁気データ"],
  });
}

async function writeInsightCache(name: string, generated: GeneratedInsight): Promise<void> {
  const dirPath = path.dirname(INSIGHTS_JSON_PATH);
  await mkdir(dirPath, { recursive: true });
  const cache = await readInsightsCache();
  cache[name] = {
    insight: generated.insight,
    generated_at: new Date().toISOString(),
    summary: generated.summary,
    legend_keywords: generated.legend_keywords,
    era: generated.era,
    tradition_type: generated.tradition_type,
    evidence: generated.evidence,
  };
  await writeFile(INSIGHTS_JSON_PATH, `${JSON.stringify(cache, null, 2)}\n`, "utf-8");
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
  const recent = (requestLog.get(ip) ?? []).filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    requestLog.set(ip, recent);
    return true;
  }
  recent.push(now);
  requestLog.set(ip, recent);
  return false;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY が設定されていません。" },
      { status: 500 },
    );
  }

  let body: InsightRequestBody;
  try {
    body = (await request.json()) as InsightRequestBody;
  } catch {
    return NextResponse.json({ error: "不正なリクエストです。" }, { status: 400 });
  }

  const name = body.name?.trim();
  const wikiSummary = body.wikiSummary?.trim();
  const elevation = body.elevation;
  const geomagF = body.geomagF;

  if (!name || !wikiSummary || elevation == null || geomagF == null) {
    return NextResponse.json(
      { error: "name, elevation, geomagF, wikiSummary が必要です。" },
      { status: 400 },
    );
  }
  if (wikiSummary.length > WIKI_SUMMARY_MAX_LENGTH) {
    return NextResponse.json(
      { error: `wikiSummary は ${WIKI_SUMMARY_MAX_LENGTH} 文字以内で指定してください。` },
      { status: 400 },
    );
  }

  const clientIp = getClientIp(request);
  if (isRateLimited(clientIp)) {
    return NextResponse.json(
      { error: "リクエストが多すぎます。しばらく待ってから再試行してください。" },
      { status: 429 },
    );
  }

  const prompt = `以下のデータをもとに、古代の人がこの場所を"あの世との境目"や
"聖なる場所"と感じた理由を、環境データと歴史的背景を結びつけて
3〜4文で考察してください。科学的な視点とロマンの両方を含めて。
出力は必ずJSONのみで、次のキーを含めてください:
{
  "insight": "3〜4文の考察本文",
  "summary": "1文の要約",
  "legend_keywords": ["伝承キーワードを2〜6個"],
  "era": "古代/中世/近世/近代/不詳のいずれか",
  "tradition_type": "神話/民間伝承/修験道/怪異譚/信仰史など",
  "evidence": ["情報源を最大5件。URLか資料名"]
}

地点名: ${name}
標高: ${elevation}m
地磁気強度: ${geomagF}nT（日本の平均は約46000nT）
Wikipedia情報: ${wikiSummary}`;

  let lastStatus = 500;
  let generatedFromGemini: GeneratedInsight | null = null;

  for (const model of GEMINI_MODELS) {
    const endpoint = `${GEMINI_ENDPOINT_BASE}/${model}:generateContent?key=${apiKey}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          generationConfig: {
            responseMimeType: "application/json",
          },
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
        }),
      });

      if (!response.ok) {
        lastStatus = response.status;
        continue;
      }

      const data = (await response.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!text) {
        lastStatus = 500;
        continue;
      }
      generatedFromGemini = parseGeneratedInsight(text) ?? fallbackGeneratedInsight(text);
      if (generatedFromGemini) {
        break;
      }
    } catch {
      lastStatus = 500;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  const generated = generatedFromGemini
    ? generatedFromGemini
    : buildLocalGeneratedInsight({
        name,
        elevation,
        geomagF,
        wikiSummary,
      });

  try {
    await writeInsightCache(name, generated);
  } catch {
    return NextResponse.json(
      { error: "考察は生成されましたが、キャッシュ保存に失敗しました。" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ...generated,
    generated_at: new Date().toISOString(),
    model: generatedFromGemini ? "gemini" : "local-fallback",
    fallback: !generatedFromGemini,
    lastStatus: generatedFromGemini ? undefined : lastStatus,
  });
}
