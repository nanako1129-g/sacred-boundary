import { NextRequest, NextResponse } from "next/server";

const WIKIPEDIA_ACTION_ENDPOINT = "https://ja.wikipedia.org/w/api.php";

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

const PHOTO_KEYWORDS_MAP: Record<string, string> = {
  恐山: "japan,mountain,temple",
  立山: "japan,mountain,alpine",
  熊野那智大社: "japan,shrine,forest",
  高野山: "japan,temple,cedar",
  出雲大社: "japan,shrine,architecture",
  分杭峠: "japan,forest,pass",
  戸隠神社: "japan,shrine,forest,path",
  伊勢神宮: "japan,shrine,torii",
  縄文杉: "japan,forest,tree,moss",
  貴船神社: "japan,shrine,lantern",
};

function extractFirstThreeSentences(text: string): string {
  const sentences = text
    .split("。")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
  return sentences.length ? `${sentences.join("。")}。` : "";
}

function buildFallbackPhotoUrl(title: string): string {
  const keywords = PHOTO_KEYWORDS_MAP[title] ?? "japan,nature,shrine";
  const lock = encodeURIComponent(title).length;
  return `https://loremflickr.com/900/420/${keywords}?lock=${lock}`;
}

function buildFallbackPageUrl(title: string): string {
  return `https://ja.wikipedia.org/wiki/${encodeURIComponent(title)}`;
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

  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "extracts|pageimages|info",
    exintro: "1",
    explaintext: "1",
    pithumbsize: "1200",
    piprop: "thumbnail|original",
    inprop: "url",
    titles: title,
  });
  const url = `${WIKIPEDIA_ACTION_ENDPOINT}?${params.toString()}`;

  try {
    const response = await fetch(url, { next: { revalidate: 60 * 60 * 24 * 7 } });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Wikipedia から情報を取得できませんでした。" },
        { status: response.status },
      );
    }

    const data = (await response.json()) as {
      query?: {
        pages?: Array<{
          missing?: boolean;
          extract?: string;
          fullurl?: string;
          thumbnail?: { source?: string };
          original?: { source?: string };
        }>;
      };
    };
    const page = data.query?.pages?.[0];
    if (!page || page.missing) {
      return NextResponse.json({
        title,
        extract: `${title}は日本各地で語り継がれる聖地として知られる地点です。`,
        pageUrl: buildFallbackPageUrl(title),
        imageUrl: buildFallbackPhotoUrl(title),
        fallback: true,
      });
    }

    const extract = page.extract ?? "";
    const shortExtract = extractFirstThreeSentences(extract);

    if (!shortExtract) {
      return NextResponse.json({
        title,
        extract: `${title}は日本各地で語り継がれる聖地として知られる地点です。`,
        pageUrl: page.fullurl ?? buildFallbackPageUrl(title),
        imageUrl: page.original?.source ?? page.thumbnail?.source ?? buildFallbackPhotoUrl(title),
        fallback: true,
      });
    }

    return NextResponse.json({
      title,
      extract: shortExtract,
      pageUrl: page.fullurl,
      imageUrl: page.original?.source ?? page.thumbnail?.source,
      fallback: false,
    });
  } catch {
    return NextResponse.json({
      title,
      extract: `${title}は日本各地で語り継がれる聖地として知られる地点です。`,
      pageUrl: buildFallbackPageUrl(title),
      imageUrl: buildFallbackPhotoUrl(title),
      fallback: true,
    });
  }
}
