import { NextRequest, NextResponse } from "next/server";

const GSI_ENDPOINT =
  "https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php";

export async function GET(request: NextRequest) {
  const lat = request.nextUrl.searchParams.get("lat");
  const lon = request.nextUrl.searchParams.get("lon");

  if (!lat || !lon) {
    return NextResponse.json({ error: "lat と lon が必要です。" }, { status: 400 });
  }

  const latNum = Number(lat);
  const lonNum = Number(lon);

  if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
    return NextResponse.json({ error: "lat/lon は数値で指定してください。" }, { status: 400 });
  }

  const url = `${GSI_ENDPOINT}?lon=${lonNum}&lat=${latNum}&outtype=JSON`;

  try {
    const response = await fetch(url, {
      next: { revalidate: 60 * 60 * 24 * 7 },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "国土地理院 API から標高を取得できませんでした。" },
        { status: response.status },
      );
    }

    const data = (await response.json()) as { elevation?: number | string; hsrc?: string };

    return NextResponse.json({
      elevation: data.elevation === "-----" ? null : Number(data.elevation),
      source: data.hsrc ?? "unknown",
    });
  } catch {
    return NextResponse.json(
      { error: "標高取得中に通信エラーが発生しました。" },
      { status: 500 },
    );
  }
}
