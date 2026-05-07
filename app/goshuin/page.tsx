"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type VisitPhoto = {
  id: string;
  url: string;
};

type VisitRow = {
  id: string;
  visited_on: string;
  memo: string | null;
  created_at: string;
  is_public: boolean;
  spot_name: string;
  spot_lat: number | null;
  spot_lon: number | null;
  photos: VisitPhoto[] | null;
};

type VisitView = {
  id: string;
  spotName: string;
  visitedOn: string;
  memo: string;
  createdAt: string;
  isPublic: boolean;
  spotLat: number | null;
  spotLon: number | null;
  photos: Array<{ id: string; url: string }>;
};

type PilgrimMapSpot = {
  spotName: string;
  lat: number;
  lon: number;
  latestVisitedOn: string;
  visitCount: number;
};

type PilgrimRoutePoint = {
  id: string;
  spotName: string;
  lat: number;
  lon: number;
  visitedOn: string;
  createdAt: string;
};

const GoshuinPilgrimMap = dynamic(() => import("./pilgrim-map"), { ssr: false });

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
  const [editingVisitId, setEditingVisitId] = useState<string | null>(null);
  const [editVisitedOn, setEditVisitedOn] = useState("");
  const [editMemo, setEditMemo] = useState("");
  const [deletingVisitId, setDeletingVisitId] = useState<string | null>(null);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"list" | "map">("list");
  const [mapViewMode, setMapViewMode] = useState<"spots" | "route" | "both">("both");

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

      const response = await fetch("/api/visits", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        setError("御朱印記録の取得に失敗しました。");
        setIsLoading(false);
        return;
      }
      const payload = (await response.json()) as { visits: VisitRow[] };
      const data = payload.visits ?? [];

      const normalized = ((data ?? []) as VisitRow[]).map((visit) => {
        return {
          id: visit.id,
          spotName: visit.spot_name ?? "不明なスポット",
          visitedOn: visit.visited_on,
          memo: visit.memo ?? "",
          createdAt: visit.created_at,
          isPublic: visit.is_public,
          spotLat: visit.spot_lat,
          spotLon: visit.spot_lon,
          photos: (visit.photos ?? []).filter((photo) => !!photo.url),
        };
      });

      setItems(normalized);
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

  const pilgrimMapSpots = useMemo(() => {
    const bySpotKey = new Map<
      string,
      { spotName: string; lat: number; lon: number; latestVisitedOn: string; visitCount: number }
    >();
    for (const item of filteredItems) {
      if (typeof item.spotLat !== "number" || typeof item.spotLon !== "number") {
        continue;
      }
      const key = `${item.spotName}:${item.spotLat}:${item.spotLon}`;
      const current = bySpotKey.get(key);
      if (!current) {
        bySpotKey.set(key, {
          spotName: item.spotName,
          lat: item.spotLat,
          lon: item.spotLon,
          latestVisitedOn: item.visitedOn,
          visitCount: 1,
        });
        continue;
      }
      current.visitCount += 1;
      if (item.visitedOn > current.latestVisitedOn) {
        current.latestVisitedOn = item.visitedOn;
      }
    }
    return Array.from(bySpotKey.values());
  }, [filteredItems]);

  const pilgrimRoutePoints = useMemo(() => {
    return filteredItems
      .filter((item): item is VisitView & { spotLat: number; spotLon: number } => {
        return typeof item.spotLat === "number" && typeof item.spotLon === "number";
      })
      .map((item) => ({
        id: item.id,
        spotName: item.spotName,
        lat: item.spotLat,
        lon: item.spotLon,
        visitedOn: item.visitedOn,
        createdAt: item.createdAt,
      }))
      .sort((a, b) => {
        if (a.visitedOn === b.visitedOn) {
          return a.createdAt.localeCompare(b.createdAt);
        }
        return a.visitedOn.localeCompare(b.visitedOn);
      });
  }, [filteredItems]);

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

  const startEdit = (item: VisitView) => {
    setEditingVisitId(item.id);
    setEditVisitedOn(item.visitedOn);
    setEditMemo(item.memo);
    setError(null);
  };

  const cancelEdit = () => {
    setEditingVisitId(null);
    setEditVisitedOn("");
    setEditMemo("");
  };

  const handleSaveEdit = async (item: VisitView) => {
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
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          visitId: item.id,
          visitedOn: editVisitedOn,
          memo: editMemo,
        }),
      });

      if (!response.ok) {
        const failed = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(failed?.error ?? "訪問記録の更新に失敗しました。");
      }

      setItems((prev) =>
        prev.map((entry) =>
          entry.id === item.id ? { ...entry, visitedOn: editVisitedOn, memo: editMemo } : entry,
        ),
      );
      cancelEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "訪問記録の更新に失敗しました。");
    } finally {
      setUpdatingVisitId(null);
    }
  };

  const handleDelete = async (item: VisitView) => {
    const confirmed = window.confirm(`${item.spotName} の記録を削除しますか？`);
    if (!confirmed) {
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setError("ログイン状態を確認できませんでした。再ログインしてください。");
      return;
    }

    setDeletingVisitId(item.id);
    setError(null);

    try {
      const response = await fetch("/api/visits", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ visitId: item.id }),
      });

      if (!response.ok) {
        const failed = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(failed?.error ?? "訪問記録の削除に失敗しました。");
      }

      setItems((prev) => prev.filter((entry) => entry.id !== item.id));
      if (editingVisitId === item.id) {
        cancelEdit();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "訪問記録の削除に失敗しました。");
    } finally {
      setDeletingVisitId(null);
    }
  };

  const handleDeletePhoto = async (visitId: string, photoId: string) => {
    const confirmed = window.confirm("この写真だけ削除しますか？");
    if (!confirmed) {
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setError("ログイン状態を確認できませんでした。再ログインしてください。");
      return;
    }

    setDeletingPhotoId(photoId);
    setError(null);

    try {
      const response = await fetch("/api/photos", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ photoId }),
      });

      if (!response.ok) {
        const failed = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(failed?.error ?? "写真削除に失敗しました。");
      }

      setItems((prev) =>
        prev.map((entry) =>
          entry.id === visitId
            ? { ...entry, photos: entry.photos.filter((photo) => photo.id !== photoId) }
            : entry,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "写真削除に失敗しました。");
    } finally {
      setDeletingPhotoId(null);
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
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("list")}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                activeTab === "list" ? "bg-torii text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              御朱印リスト
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("map")}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                activeTab === "map" ? "bg-torii text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              巡礼マップ
            </button>
          </div>
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

      {isLoggedIn && !isLoading && activeTab === "list" && !filteredItems.length && (
        <section className="rounded-xl border border-slate-300 bg-white p-4 shadow">
          <p className="text-sm text-slate-700">
            条件に合う記録がありません。検索条件を調整するか、地図から記録を追加してください。
          </p>
        </section>
      )}

      {isLoggedIn && !isLoading && activeTab === "map" && (
        <section className="rounded-xl border border-amber-200 bg-washi/95 p-4 shadow-ema">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-lg font-semibold text-indigo-deep">巡礼マップ</h2>
            <p className="text-xs text-indigo-deep/70">
              訪問済み聖地: {pilgrimMapSpots.length} 箇所 / 記録: {filteredItems.length} 件
            </p>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setMapViewMode("spots")}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                mapViewMode === "spots" ? "bg-torii text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              スポット表示
            </button>
            <button
              type="button"
              onClick={() => setMapViewMode("route")}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                mapViewMode === "route" ? "bg-torii text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              軌跡表示
            </button>
            <button
              type="button"
              onClick={() => setMapViewMode("both")}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                mapViewMode === "both" ? "bg-torii text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              両方表示
            </button>
          </div>
          {!pilgrimMapSpots.length ? (
            <p className="text-sm text-slate-700">
              地図に表示できる訪問記録がありません。検索条件を調整するか、新しい参拝記録を追加してください。
            </p>
          ) : (
            <GoshuinPilgrimMap
              spots={pilgrimMapSpots as PilgrimMapSpot[]}
              routePoints={pilgrimRoutePoints as PilgrimRoutePoint[]}
              viewMode={mapViewMode}
            />
          )}
        </section>
      )}

      {activeTab === "list" && filteredItems.map((item) => (
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
              <button
                type="button"
                onClick={() => startEdit(item)}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700"
              >
                編集
              </button>
              <button
                type="button"
                disabled={deletingVisitId === item.id}
                onClick={() => {
                  void handleDelete(item);
                }}
                className="rounded-md border border-red-300 bg-white px-2 py-1 text-[11px] font-semibold text-red-700 disabled:opacity-60"
              >
                {deletingVisitId === item.id ? "削除中..." : "削除"}
              </button>
            </div>
          </div>
          {editingVisitId === item.id ? (
            <div className="mb-3 space-y-2 rounded-md border border-slate-200 bg-white/80 p-3">
              <label className="block text-xs text-slate-700">
                訪問日
                <input
                  type="date"
                  value={editVisitedOn}
                  onChange={(event) => setEditVisitedOn(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                />
              </label>
              <label className="block text-xs text-slate-700">
                感想
                <textarea
                  value={editMemo}
                  onChange={(event) => setEditMemo(event.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                />
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  disabled={updatingVisitId === item.id}
                  onClick={() => {
                    void handleSaveEdit(item);
                  }}
                  className="rounded-md bg-torii px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
                >
                  保存
                </button>
              </div>
            </div>
          ) : (
            <div className={`mb-3 grid gap-3 ${item.photos.length ? "md:grid-cols-[180px_minmax(0,1fr)]" : "grid-cols-1"}`}>
              {!!item.photos.length && (
                <div className="space-y-2">
                  {item.photos.map((photo) => (
                    <div key={photo.id} className="relative aspect-[3/4] w-full overflow-hidden rounded-md border border-amber-100 bg-white">
                      <img
                        src={photo.url}
                        alt={`${item.spotName}の御朱印写真`}
                        className="h-full w-full object-cover"
                      />
                      <button
                        type="button"
                        disabled={deletingPhotoId === photo.id}
                        onClick={() => {
                          void handleDeletePhoto(item.id, photo.id);
                        }}
                        className="absolute right-2 top-2 rounded bg-white/90 px-2 py-1 text-[11px] font-semibold text-red-700 shadow disabled:opacity-60"
                      >
                        {deletingPhotoId === photo.id ? "削除中..." : "写真削除"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className={`rounded-md border border-slate-200 bg-white/70 p-3 ${item.photos.length ? "" : "max-w-2xl"}`}>
                <p className="mb-1 text-xs font-semibold text-slate-600">コメント</p>
                <p className="min-h-[120px] whitespace-pre-wrap text-sm text-slate-800">
                  {item.memo || "コメント未入力"}
                </p>
              </div>
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
