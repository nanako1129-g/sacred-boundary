import { NextRequest, NextResponse } from "next/server";

const WIKIPEDIA_SUMMARY_ENDPOINT = "https://ja.wikipedia.org/api/rest_v1/page/summary";

const WIKIPEDIA_TITLE_MAP: Record<string, string> = {
  恐山: "恐山",
  "立山（地獄谷）": "立山",
  立山: "立山",
  熊野那智大社: "熊野那智大社",
  高野山: "高野山",
  出雲大社: "出雲大社",
  分杭峠: "分杭峠",
  戸隠神社: "戸隠神社",
  伊勢神宮: "伊勢神宮",
  "屋久島（縄文杉）": "縄文杉",
  屋久島: "縄文杉",
  貴船神社: "貴船神社",
};

function extractFirstThreeSentences(text: string): string {
  const sentences = text
    .split("。")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
  return sentences.length ? `${sentences.join("。")}。` : "";
}

export async function GET(request: NextRequest) {
  const spotName = request.nextUrl.searchParams.get("name");
  if (!spotName) {
    return NextResponse.json({ error: "name が必要です。" }, { status: 400 });
  }

  const title = WIKIPEDIA_TITLE_MAP[spotName];
  if (!title) {
    return NextResponse.json({ error: "対応する記事が見つかりません。" }, { status: 404 });
  }

  const url = `${WIKIPEDIA_SUMMARY_ENDPOINT}/${encodeURIComponent(title)}`;

  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      next: { revalidate: 60 * 60 * 24 * 7 },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Wikipedia から情報を取得できませんでした。" },
        { status: response.status },
      );
    }

    const data = (await response.json()) as { extract?: string };
    const extract = data.extract ?? "";
    const shortExtract = extractFirstThreeSentences(extract);

    if (!shortExtract) {
      return NextResponse.json(
        { error: "Wikipedia から情報を取得できませんでした。" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      title,
      extract: shortExtract,
    });
  } catch {
    return NextResponse.json(
      { error: "Wikipedia から情報を取得できませんでした。" },
      { status: 500 },
    );
  }
}
