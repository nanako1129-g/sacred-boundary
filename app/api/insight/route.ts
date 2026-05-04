import { NextRequest, NextResponse } from "next/server";

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

const requestLog = new Map<string, number[]>();

type InsightRequestBody = {
  name?: string;
  elevation?: number;
  geomagF?: number;
  wikiSummary?: string;
};

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

地点名: ${name}
標高: ${elevation}m
地磁気強度: ${geomagF}nT（日本の平均は約46000nT）
Wikipedia情報: ${wikiSummary}`;

  let lastStatus = 500;

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
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
        }),
      });

      if (!response.ok) {
        lastStatus = response.status;
        // モデル未対応時は次の候補へフォールバック
        if (response.status === 404) {
          continue;
        }

        return NextResponse.json(
          { error: "考察の生成に失敗しました。" },
          { status: response.status },
        );
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

      return NextResponse.json({ insight: text, model });
    } catch {
      lastStatus = 500;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return NextResponse.json(
    { error: "考察の生成に失敗しました。" },
    { status: lastStatus === 404 ? 503 : lastStatus },
  );
}
