import { NextRequest, NextResponse } from "next/server";

import { createSupabaseServiceClient } from "@/lib/supabase/server";

const MAX_FILES = 3;
const MAX_FILE_SIZE = 8 * 1024 * 1024;

function parseVisitedOn(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  return value.trim();
}

export async function POST(request: NextRequest) {
  const supabase = createSupabaseServiceClient();
  const authHeader = request.headers.get("authorization");
  const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (!accessToken) {
    return NextResponse.json({ error: "認証トークンがありません。" }, { status: 401 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(accessToken);

  if (authError || !user) {
    return NextResponse.json({ error: "ログイン状態を確認できませんでした。" }, { status: 401 });
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

  await supabase.from("users").upsert(
    {
      id: user.id,
      display_name: user.user_metadata?.display_name ?? user.email ?? "巡礼者",
      avatar_url: user.user_metadata?.avatar_url ?? null,
    },
    { onConflict: "id" },
  );

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
    return NextResponse.json({ error: "訪問記録の保存に失敗しました。" }, { status: 500 });
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

    const fileExtension = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
    const storagePath = `${user.id}/${visit.id}/${crypto.randomUUID()}.${fileExtension}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from("visit-photos")
      .upload(storagePath, fileBuffer, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: "写真アップロードに失敗しました。" }, { status: 500 });
    }

    uploadedPaths.push(storagePath);
    await supabase.from("photos").insert({
      visit_id: visit.id,
      user_id: user.id,
      storage_path: storagePath,
    });
  }

  return NextResponse.json({
    visitId: visit.id,
    uploadedPhotos: uploadedPaths.length,
  });
}

export async function PATCH(request: NextRequest) {
  const supabase = createSupabaseServiceClient();
  const authHeader = request.headers.get("authorization");
  const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (!accessToken) {
    return NextResponse.json({ error: "認証トークンがありません。" }, { status: 401 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(accessToken);

  if (authError || !user) {
    return NextResponse.json({ error: "ログイン状態を確認できませんでした。" }, { status: 401 });
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
