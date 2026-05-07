"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type VisitPhoto = {
  id: string;
  storage_path: string;
};

type VisitRow = {
  id: string;
  visited_on: string;
  memo: string | null;
  created_at: string;
  is_public: boolean;
  spots: { name: string } | { name: string }[] | null;
  photos: VisitPhoto[] | null;
};

type VisitView = {
  id: string;
  spotName: string;
  visitedOn: string;
  memo: string;
  createdAt: string;
  isPublic: boolean;
  photos: Array<{ id: string; url: string }>;
};

export default function GoshuinPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [items, setItems] = useState<VisitView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [updatingVisitId, setUpdatingVisitId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError(null);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setIsLoggedIn(false);
        setItems([]);
        setIsLoading(false);
        return;
      }

      setIsLoggedIn(true);

      const { data, error: visitError } = await supabase
        .from("visits")
        .select("id, visited_on, memo, created_at, is_public, spots(name), photos(id, storage_path)")
        .eq("user_id", session.user.id)
        .order("visited_on", { ascending: false });

      if (visitError) {
        setError("御朱印記録の取得に失敗しました。");
        setIsLoading(false);
        return;
      }

      const normalized = ((data ?? []) as VisitRow[]).map(async (visit) => {
        const spotName = Array.isArray(visit.spots) ? visit.spots[0]?.name : visit.spots?.name;
        const photos = await Promise.all(
          (visit.photos ?? []).map(async (photo) => {
            const { data: signed } = await supabase.storage
              .from("visit-photos")
              .createSignedUrl(photo.storage_path, 60 * 60);
            return {
              id: photo.id,
              url: signed?.signedUrl ?? "",
            };
          }),
        );

        return {
          id: visit.id,
          spotName: spotName ?? "不明なスポット",
          visitedOn: visit.visited_on,
          memo: visit.memo ?? "",
          createdAt: visit.created_at,
          isPublic: visit.is_public,
          photos: photos.filter((photo) => !!photo.url),
        };
      });

      setItems(await Promise.all(normalized));
      setIsLoading(false);
    };

    void load();
  }, [supabase]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const byName = keyword.trim()
        ? item.spotName.toLowerCase().includes(keyword.trim().toLowerCase())
        : true;
      const byFrom = fromDate ? item.visitedOn >= fromDate : true;
      const byTo = toDate ? item.visitedOn <= toDate : true;
      return byName && byFrom && byTo;
    });
  }, [items, keyword, fromDate, toDate]);

  const handleVisibilityChange = async (item: VisitView, nextPublic: boolean) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setError("ログイン状態を確認できませんでした。再ログインしてください。");
      return;
    }

    setUpdatingVisitId(item.id);
    setError(null);

    try {
      const response = await fetch("/api/visits", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          visitId: item.id,
          isPublic: nextPublic,
        }),
      });

      if (!response.ok) {
        throw new Error("公開設定の更新に失敗しました。");
      }

      setItems((prev) =>
        prev.map((entry) => (entry.id === item.id ? { ...entry, isPublic: nextPublic } : entry)),
      );
    } catch {
      setError("公開設定の更新に失敗しました。");
    } finally {
      setUpdatingVisitId(null);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 md:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-indigo-deep">わたしの御朱印帳</h1>
        <Link href="/" className="text-sm text-indigo-deep underline">
          地図へ戻る
        </Link>
      </div>

      {!isLoggedIn && !isLoading && (
        <section className="rounded-xl border border-slate-300 bg-white p-4 shadow">
          <p className="text-sm text-slate-700">閲覧にはログインが必要です。</p>
          <Link href="/login" className="mt-2 inline-block text-sm font-semibold text-torii underline">
            ログインする
          </Link>
        </section>
      )}

      {isLoading && <p className="text-sm text-slate-600">読み込み中...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {isLoggedIn && !isLoading && (
        <section className="rounded-xl border border-slate-300 bg-white p-4 shadow">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-xs text-slate-700">
              神社名で検索
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="例: 熊野"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs text-slate-700">
              訪問日（開始）
              <input
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs text-slate-700">
              訪問日（終了）
              <input
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
        </section>
      )}

      {isLoggedIn && !isLoading && !filteredItems.length && (
        <section className="rounded-xl border border-slate-300 bg-white p-4 shadow">
          <p className="text-sm text-slate-700">
            条件に合う記録がありません。検索条件を調整するか、地図から記録を追加してください。
          </p>
        </section>
      )}

      {filteredItems.map((item) => (
        <section key={item.id} className="rounded-xl border border-amber-200 bg-washi/95 p-4 shadow-ema">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-indigo-deep">{item.spotName}</h2>
            <div className="flex items-center gap-2">
              <p className="text-xs text-indigo-deep/70">
                訪問日: {new Date(item.visitedOn).toLocaleDateString("ja-JP")}
              </p>
              <button
                type="button"
                disabled={updatingVisitId === item.id}
                onClick={() => {
                  void handleVisibilityChange(item, !item.isPublic);
                }}
                className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                  item.isPublic
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-slate-200 text-slate-700"
                }`}
              >
                {updatingVisitId === item.id
                  ? "更新中..."
                  : item.isPublic
                    ? "公開中（タップで非公開）"
                    : "非公開（タップで公開）"}
              </button>
            </div>
          </div>
          {item.memo && <p className="mb-3 whitespace-pre-wrap text-sm text-slate-800">{item.memo}</p>}
          {!!item.photos.length && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {item.photos.map((photo) => (
                <img
                  key={photo.id}
                  src={photo.url}
                  alt={`${item.spotName}の御朱印写真`}
                  className="h-44 w-full rounded-md border border-amber-100 object-cover"
                />
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] text-indigo-deep/60">
            登録日時: {new Date(item.createdAt).toLocaleString("ja-JP")}
          </p>
        </section>
      ))}
    </main>
  );
}
