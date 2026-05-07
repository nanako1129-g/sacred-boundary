import { NextRequest, NextResponse } from "next/server";

import { createSupabaseServiceClient } from "@/lib/supabase/server";

async function getUserFromAuthHeader(request: NextRequest) {
  const supabase = createSupabaseServiceClient();
  const authHeader = request.headers.get("authorization");
  const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (!accessToken) {
    return { supabase, user: null, error: "認証トークンがありません。" };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(accessToken);

  if (authError || !user) {
    return { supabase, user: null, error: "ログイン状態を確認できませんでした。" };
  }

  return { supabase, user, error: null };
}

export async function DELETE(request: NextRequest) {
  const { supabase, user, error } = await getUserFromAuthHeader(request);
  if (error || !user) {
    return NextResponse.json({ error: error ?? "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { photoId?: string } | null;
  if (!body?.photoId) {
    return NextResponse.json({ error: "photoId は必須です。" }, { status: 400 });
  }

  const { data: photo, error: photoError } = await supabase
    .from("photos")
    .select("id, storage_path")
    .eq("id", body.photoId)
    .eq("user_id", user.id)
    .single();

  if (photoError || !photo) {
    return NextResponse.json({ error: "対象写真が見つかりません。" }, { status: 404 });
  }

  const { error: storageError } = await supabase.storage
    .from("visit-photos")
    .remove([photo.storage_path]);
  if (storageError) {
    return NextResponse.json(
      { error: `Storage削除に失敗しました: ${storageError.message}` },
      { status: 500 },
    );
  }

  const { error: deleteError } = await supabase
    .from("photos")
    .delete()
    .eq("id", body.photoId)
    .eq("user_id", user.id);

  if (deleteError) {
    return NextResponse.json({ error: `写真削除に失敗しました: ${deleteError.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
