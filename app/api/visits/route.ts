import { NextRequest, NextResponse } from "next/server";

import { createSupabaseServiceClient } from "@/lib/supabase/server";

const MAX_FILES = 3;
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function extensionFromMimeType(mimeType: string) {
  if (mimeType === "image/png") {
    return "png";
  }
  if (mimeType === "image/webp") {
    return "webp";
  }
  return "jpg";
}

function parseVisitedOn(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  return value.trim();
}

async function getUserFromAuthHeader(request: NextRequest) {
  const supabase = createSupabaseServiceClient();
  const authHeader = request.headers.get("authorization");
  const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (!accessToken) {
    return { supabase, user: null, accessToken: null, error: "認証トークンがありません。" };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(accessToken);

  if (authError || !user) {
    return { supabase, user: null, accessToken, error: "ログイン状態を確認できませんでした。" };
  }

  return { supabase, user, accessToken, error: null };
}

type VisitRow = {
  id: string;
  visited_on: string;
  memo: string | null;
  created_at: string;
  is_public: boolean;
  spots: { name: string; lat: number; lon: number } | Array<{ name: string; lat: number; lon: number }> | null;
};

export async function GET(request: NextRequest) {
  const { supabase, user, error } = await getUserFromAuthHeader(request);
  if (error || !user) {
    return NextResponse.json({ error: error ?? "unauthorized" }, { status: 401 });
  }

  const { data: visits, error: visitsError } = await supabase
    .from("visits")
    .select("id, visited_on, memo, created_at, is_public, spots(name, lat, lon)")
    .eq("user_id", user.id)
    .order("visited_on", { ascending: false });

  if (visitsError) {
    return NextResponse.json({ error: `訪問記録取得に失敗しました: ${visitsError.message}` }, { status: 500 });
  }

  const visitIds = (visits ?? []).map((visit) => visit.id);
  const { data: photos, error: photosError } = visitIds.length
    ? await supabase
        .from("photos")
        .select("id, visit_id, storage_path")
        .in("visit_id", visitIds)
    : { data: [], error: null };

  if (photosError) {
    return NextResponse.json({ error: `写真情報取得に失敗しました: ${photosError.message}` }, { status: 500 });
  }

  const photosByVisitId = new Map<string, Array<{ id: string; url: string }>>();
  for (const photo of photos ?? []) {
    const { data: signed } = await supabase.storage
      .from("visit-photos")
      .createSignedUrl(photo.storage_path, 60 * 60);
    if (!signed?.signedUrl) {
      continue;
    }
    const current = photosByVisitId.get(photo.visit_id) ?? [];
    current.push({ id: photo.id, url: signed.signedUrl });
    photosByVisitId.set(photo.visit_id, current);
  }

  const payload = ((visits ?? []) as VisitRow[]).map((visit) => {
    const spot = Array.isArray(visit.spots) ? visit.spots[0] : visit.spots;
    return {
      id: visit.id,
      visited_on: visit.visited_on,
      memo: visit.memo,
      created_at: visit.created_at,
      is_public: visit.is_public,
      spot_name: spot?.name ?? "不明なスポット",
      spot_lat: typeof spot?.lat === "number" ? spot.lat : null,
      spot_lon: typeof spot?.lon === "number" ? spot.lon : null,
      photos: photosByVisitId.get(visit.id) ?? [],
    };
  });

  return NextResponse.json({ visits: payload });
}

export async function POST(request: NextRequest) {
  const { supabase, user, error } = await getUserFromAuthHeader(request);
  if (error || !user) {
    return NextResponse.json({ error: error ?? "unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const spotId = formData.get("spotId");
  const visitedOn = parseVisitedOn(formData.get("visitedOn"));
  const memoRaw = formData.get("memo");
  const memo = typeof memoRaw === "string" ? memoRaw.trim() : "";

  if (typeof spotId !== "string" || !spotId.trim() || !visitedOn) {
    return NextResponse.json({ error: "spotId と visitedOn は必須です。" }, { status: 400 });
  }

  const { data: spot, error: spotError } = await supabase
    .from("spots")
    .select("id")
    .eq("id", spotId.trim())
    .single();

  if (spotError || !spot) {
    return NextResponse.json({ error: "このスポットは登録されていません。" }, { status: 404 });
  }

  const { error: profileUpsertError } = await supabase.from("users").upsert(
    {
      id: user.id,
      display_name: user.user_metadata?.display_name ?? user.email ?? "巡礼者",
      avatar_url: user.user_metadata?.avatar_url ?? null,
    },
    { onConflict: "id" },
  );
  if (profileUpsertError) {
    return NextResponse.json(
      { error: `プロフィール初期化に失敗しました: ${profileUpsertError.message}` },
      { status: 500 },
    );
  }

  const { data: visit, error: visitError } = await supabase
    .from("visits")
    .insert({
      user_id: user.id,
      spot_id: spotId.trim(),
      visited_on: visitedOn,
      memo: memo || null,
      is_public: false,
    })
    .select("id")
    .single();

  if (visitError || !visit) {
    if (visitError?.code === "23505") {
      return NextResponse.json(
        { error: "同じ神社を同じ日付で既に登録しています。日付を変えるか既存記録を使ってください。" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: `訪問記録の保存に失敗しました: ${visitError?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  const files = formData
    .getAll("photos")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0)
    .slice(0, MAX_FILES);

  const uploadedPaths: string[] = [];

  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `写真サイズは${MAX_FILE_SIZE / (1024 * 1024)}MB以下にしてください。` },
        { status: 400 },
      );
    }
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "対応している画像形式は JPEG / PNG / WEBP のみです。" },
        { status: 400 },
      );
    }

    const fileExtension = extensionFromMimeType(file.type);
    const storagePath = `${user.id}/${visit.id}/${crypto.randomUUID()}.${fileExtension}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from("visit-photos")
      .upload(storagePath, fileBuffer, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: `写真アップロードに失敗しました: ${uploadError.message}` },
        { status: 500 },
      );
    }

    uploadedPaths.push(storagePath);
    const { error: photoInsertError } = await supabase.from("photos").insert({
      visit_id: visit.id,
      user_id: user.id,
      storage_path: storagePath,
    });

    if (photoInsertError) {
      return NextResponse.json(
        { error: `写真メタ情報の保存に失敗しました: ${photoInsertError.message}` },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    visitId: visit.id,
    uploadedPhotos: uploadedPaths.length,
  });
}

export async function PATCH(request: NextRequest) {
  const { supabase, user, error } = await getUserFromAuthHeader(request);
  if (error || !user) {
    return NextResponse.json({ error: error ?? "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        visitId?: string;
        isPublic?: boolean;
      }
    | null;

  if (!body?.visitId || typeof body.isPublic !== "boolean") {
    return NextResponse.json({ error: "visitId と isPublic は必須です。" }, { status: 400 });
  }

  const { error: updateError } = await supabase
    .from("visits")
    .update({ is_public: body.isPublic })
    .eq("id", body.visitId)
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json({ error: "公開設定の更新に失敗しました。" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function PUT(request: NextRequest) {
  const { supabase, user, error } = await getUserFromAuthHeader(request);
  if (error || !user) {
    return NextResponse.json({ error: error ?? "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        visitId?: string;
        visitedOn?: string;
        memo?: string;
      }
    | null;

  if (!body?.visitId || !body.visitedOn) {
    return NextResponse.json({ error: "visitId と visitedOn は必須です。" }, { status: 400 });
  }

  const nextMemo = typeof body.memo === "string" ? body.memo.trim() : "";
  const { error: updateError } = await supabase
    .from("visits")
    .update({
      visited_on: body.visitedOn,
      memo: nextMemo || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", body.visitId)
    .eq("user_id", user.id);

  if (updateError) {
    if (updateError.code === "23505") {
      return NextResponse.json(
        { error: "同じ神社を同じ日付で既に登録しています。別の日付を指定してください。" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: `訪問記録の更新に失敗しました: ${updateError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const { supabase, user, error } = await getUserFromAuthHeader(request);
  if (error || !user) {
    return NextResponse.json({ error: error ?? "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { visitId?: string } | null;
  if (!body?.visitId) {
    return NextResponse.json({ error: "visitId は必須です。" }, { status: 400 });
  }

  const { data: photos } = await supabase
    .from("photos")
    .select("storage_path")
    .eq("visit_id", body.visitId)
    .eq("user_id", user.id);

  const storagePaths = (photos ?? []).map((photo) => photo.storage_path);
  if (storagePaths.length) {
    await supabase.storage.from("visit-photos").remove(storagePaths);
  }

  const { error: deleteError } = await supabase
    .from("visits")
    .delete()
    .eq("id", body.visitId)
    .eq("user_id", user.id);

  if (deleteError) {
    return NextResponse.json(
      { error: `訪問記録の削除に失敗しました: ${deleteError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
