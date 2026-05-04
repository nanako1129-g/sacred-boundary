import { NextRequest, NextResponse } from "next/server";

const GEMINI_MODEL = "gemini-2.0-flash-exp";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

type InsightRequestBody = {
  name?: string;
  elevation?: number;
  geomagF?: number;
  wikiSummary?: string;
};

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

  const prompt = `以下のデータをもとに、古代の人がこの場所を"あの世との境目"や
"聖なる場所"と感じた理由を、環境データと歴史的背景を結びつけて
3〜4文で考察してください。科学的な視点とロマンの両方を含めて。

地点名: ${name}
標高: ${elevation}m
地磁気強度: ${geomagF}nT（日本の平均は約46000nT）
Wikipedia情報: ${wikiSummary}`;

  try {
    const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
      }),
    });

    if (!response.ok) {
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
      return NextResponse.json(
        { error: "考察の生成に失敗しました。" },
        { status: 500 },
      );
    }

    return NextResponse.json({ insight: text });
  } catch {
    return NextResponse.json(
      { error: "考察の生成に失敗しました。" },
      { status: 500 },
    );
  }
}
