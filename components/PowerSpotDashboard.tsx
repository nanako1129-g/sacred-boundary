"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { estimateGeomagneticData } from "@/lib/geomagnetism";
import { ALL_SPOTS, Spot } from "@/lib/spots";

type SpotDetail = {
  elevation: number | null;
  source: string;
  magnetic: ReturnType<typeof estimateGeomagneticData>;
};

type WikiDetail = {
  status: "loading" | "success" | "error";
  extract?: string;
};

type InsightDetail = {
  status: "loading" | "success" | "error";
  text?: string;
};

const sacredIcon = new L.Icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const randomIcon = new L.Icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

async function fetchElevation(lat: number, lon: number) {
  const res = await fetch(`/api/elevation?lat=${lat}&lon=${lon}`);
  if (!res.ok) {
    throw new Error("標高データの取得に失敗しました。");
  }
  return (await res.json()) as { elevation: number | null; source: string };
}

async function fetchWikipediaSummary(spotName: string) {
  const res = await fetch(`/api/wikipedia?name=${encodeURIComponent(spotName)}`);
  if (!res.ok) {
    throw new Error("Wikipedia要約の取得に失敗しました。");
  }
  return (await res.json()) as { extract: string };
}

async function fetchInsight(payload: {
  name: string;
  elevation: number;
  geomagF: number;
  wikiSummary: string;
}) {
  const res = await fetch("/api/insight", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error("考察の生成に失敗しました。");
  }
  return (await res.json()) as { insight: string };
}

export default function PowerSpotDashboard() {
  const [details, setDetails] = useState<Record<string, SpotDetail>>({});
  const [activeSpotId, setActiveSpotId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wikiDetails, setWikiDetails] = useState<Record<string, WikiDetail>>({});
  const [insightDetails, setInsightDetails] = useState<Record<string, InsightDetail>>({});
  const [sortKey, setSortKey] = useState<"elevation" | "magnetic">("elevation");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

  useEffect(() => {
    const loadAll = async () => {
      try {
        const entries = await Promise.all(
          ALL_SPOTS.map(async (spot) => {
            const elevation = await fetchElevation(spot.lat, spot.lon);
            return [
              spot.id,
              {
                ...elevation,
                magnetic: estimateGeomagneticData(spot.lat, spot.lon),
              },
            ] as const;
          }),
        );
        setDetails(Object.fromEntries(entries));
      } catch {
        setError("一部の標高データの取得に失敗しました。");
      }
    };

    void loadAll();
  }, []);

  const chartData = useMemo(() => {
    const sacredValues = ALL_SPOTS.filter((s) => s.type === "sacred")
      .map((s) => details[s.id]?.elevation)
      .filter((v): v is number => typeof v === "number");
    const randomValues = ALL_SPOTS.filter((s) => s.type === "random")
      .map((s) => details[s.id]?.elevation)
      .filter((v): v is number => typeof v === "number");

    const avg = (list: number[]) =>
      list.length ? Number((list.reduce((a, b) => a + b, 0) / list.length).toFixed(1)) : 0;

    return [
      { group: "聖地", averageElevation: avg(sacredValues), count: sacredValues.length },
      { group: "ランダム", averageElevation: avg(randomValues), count: randomValues.length },
    ];
  }, [details]);

  const tableRows = useMemo(() => {
    const getSortValue = (spot: Spot) => {
      const detail = details[spot.id];
      if (!detail) {
        return Number.NEGATIVE_INFINITY;
      }
      return sortKey === "elevation"
        ? (detail.elevation ?? Number.NEGATIVE_INFINITY)
        : detail.magnetic.totalIntensityNt;
    };

    return [...ALL_SPOTS].sort((a, b) => {
      const diff = getSortValue(b) - getSortValue(a);
      return sortOrder === "desc" ? diff : -diff;
    });
  }, [details, sortKey, sortOrder]);

  const handleSortChange = (nextKey: "elevation" | "magnetic") => {
    if (sortKey === nextKey) {
      setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"));
      return;
    }
    setSortKey(nextKey);
    setSortOrder("desc");
  };

  const activeSpot = ALL_SPOTS.find((spot) => spot.id === activeSpotId) ?? null;
  const activeDetail = activeSpot ? details[activeSpot.id] : null;
  const activeWiki = activeSpot ? wikiDetails[activeSpot.id] : null;
  const activeInsight = activeSpot ? insightDetails[activeSpot.id] : null;

  const handleSpotClick = async (spot: Spot) => {
    setActiveSpotId(spot.id);
    setError(null);

    let currentDetail = details[spot.id] ?? null;

    if (!currentDetail) {
      try {
        setLoadingId(spot.id);
        const elevation = await fetchElevation(spot.lat, spot.lon);
        const nextDetail: SpotDetail = {
          ...elevation,
          magnetic: estimateGeomagneticData(spot.lat, spot.lon),
        };
        currentDetail = nextDetail;
        setDetails((prev) => ({
          ...prev,
          [spot.id]: nextDetail,
        }));
      } catch {
        setError(`${spot.name} のデータ取得に失敗しました。`);
      } finally {
        setLoadingId(null);
      }
    }

    let currentWikiSummary =
      wikiDetails[spot.id]?.status === "success" ? wikiDetails[spot.id].extract ?? "" : "";

    if (spot.type === "sacred" && !wikiDetails[spot.id]) {
      setWikiDetails((prev) => ({
        ...prev,
        [spot.id]: { status: "loading" },
      }));

      try {
        const wiki = await fetchWikipediaSummary(spot.name);
        currentWikiSummary = wiki.extract;
        setWikiDetails((prev) => ({
          ...prev,
          [spot.id]: { status: "success", extract: wiki.extract },
        }));
      } catch {
        setWikiDetails((prev) => ({
          ...prev,
          [spot.id]: { status: "error" },
        }));
      }
    }

    if (
      spot.type === "sacred" &&
      currentDetail &&
      currentDetail.elevation != null &&
      currentWikiSummary &&
      !insightDetails[spot.id]
    ) {
      setInsightDetails((prev) => ({
        ...prev,
        [spot.id]: { status: "loading" },
      }));

      try {
        const insight = await fetchInsight({
          name: spot.name,
          elevation: currentDetail.elevation,
          geomagF: currentDetail.magnetic.totalIntensityNt,
          wikiSummary: currentWikiSummary,
        });
        setInsightDetails((prev) => ({
          ...prev,
          [spot.id]: { status: "success", text: insight.insight },
        }));
      } catch {
        setInsightDetails((prev) => ({
          ...prev,
          [spot.id]: { status: "error" },
        }));
      }
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-8">
      <h1 className="text-2xl font-bold md:text-3xl">
        パワースポット環境データ分析（聖地 vs ランダム）
      </h1>

      <div className="h-[500px] overflow-hidden rounded-xl border border-slate-300 bg-white shadow">
        <MapContainer
          center={[36.2048, 138.2529]}
          zoom={5}
          minZoom={4}
          maxZoom={12}
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {ALL_SPOTS.map((spot) => (
            <Marker
              key={spot.id}
              position={[spot.lat, spot.lon]}
              icon={spot.type === "sacred" ? sacredIcon : randomIcon}
              eventHandlers={{
                click: () => {
                  void handleSpotClick(spot);
                },
              }}
            >
              <Popup>
                <div className="text-sm">
                  <p className="font-bold">
                    {spot.name}（{spot.type === "sacred" ? "聖地" : "ランダム"}）
                  </p>
                  <p>緯度: {spot.lat.toFixed(4)}</p>
                  <p>経度: {spot.lon.toFixed(4)}</p>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-slate-300 bg-white p-4 shadow">
          <h2 className="mb-3 text-lg font-semibold">クリックした地点の詳細</h2>
          {!activeSpot && <p className="text-slate-600">ピンをクリックすると詳細を表示します。</p>}
          {activeSpot && (
            <div className="space-y-1 text-sm">
              <p>
                <span className="font-semibold">地点名:</span> {activeSpot.name}
              </p>
              <p>
                <span className="font-semibold">分類:</span>{" "}
                {activeSpot.type === "sacred" ? "聖地" : "ランダム"}
              </p>
              <p>
                <span className="font-semibold">標高:</span>{" "}
                {loadingId === activeSpot.id
                  ? "取得中..."
                  : activeDetail?.elevation != null
                    ? `${activeDetail.elevation} m`
                    : "未取得"}
              </p>
              {activeDetail && (
                <>
                  <p>
                    <span className="font-semibold">地磁気強度:</span>{" "}
                    {activeDetail.magnetic.totalIntensityNt} nT
                  </p>
                  <p>
                    <span className="font-semibold">偏角:</span> {activeDetail.magnetic.declinationDeg}
                    °
                  </p>
                  <p>
                    <span className="font-semibold">伏角:</span> {activeDetail.magnetic.inclinationDeg}
                    °
                  </p>
                  <p className="text-xs text-slate-500">
                    標高ソース: 国土地理院API ({activeDetail.source})
                  </p>
                </>
              )}
              {activeSpot.type === "sacred" && (
                <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3">
                  <p className="mb-1 font-semibold text-rose-900">歴史・由来</p>
                  {activeWiki?.status === "loading" && <p>取得中...</p>}
                  {activeWiki?.status === "success" && <p className="leading-relaxed">{activeWiki.extract}</p>}
                  {activeWiki?.status === "error" && <p>情報を取得できませんでした</p>}
                  {!activeWiki && <p>取得中...</p>}
                </div>
              )}
              {activeSpot.type === "sacred" && (
                <div className="mt-3 rounded-md border border-violet-200 bg-violet-50 p-3">
                  <p className="mb-1 font-semibold text-violet-900">AIによる考察</p>
                  {activeInsight?.status === "loading" && <p>考察を生成中...</p>}
                  {activeInsight?.status === "success" && (
                    <p className="leading-relaxed whitespace-pre-wrap">{activeInsight.text}</p>
                  )}
                  {activeInsight?.status === "error" && <p>情報を取得できませんでした</p>}
                  {!activeInsight && <p>考察を生成中...</p>}
                </div>
              )}
            </div>
          )}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </section>

        <section className="rounded-xl border border-slate-300 bg-white p-4 shadow">
          <h2 className="mb-2 text-lg font-semibold">標高比較（平均）</h2>
          <p className="mb-4 text-xs text-slate-500">
            聖地10地点とランダム10地点の平均標高を比較しています。
          </p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="group" />
                <YAxis unit="m" />
                <Tooltip />
                <Legend />
                <Bar dataKey="averageElevation" name="平均標高" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-slate-300 bg-white p-4 shadow">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">全20地点データ一覧</h2>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-600">ソート:</span>
            <button
              type="button"
              onClick={() => handleSortChange("elevation")}
              className={`rounded-md border px-3 py-1 ${
                sortKey === "elevation"
                  ? "border-rose-300 bg-rose-100 text-rose-800"
                  : "border-slate-300 bg-white text-slate-700"
              }`}
            >
              標高 {sortKey === "elevation" ? (sortOrder === "desc" ? "▼" : "▲") : ""}
            </button>
            <button
              type="button"
              onClick={() => handleSortChange("magnetic")}
              className={`rounded-md border px-3 py-1 ${
                sortKey === "magnetic"
                  ? "border-sky-300 bg-sky-100 text-sky-800"
                  : "border-slate-300 bg-white text-slate-700"
              }`}
            >
              地磁気強度 {sortKey === "magnetic" ? (sortOrder === "desc" ? "▼" : "▲") : ""}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 text-left">
                <th className="border border-slate-300 px-3 py-2">地点名</th>
                <th className="border border-slate-300 px-3 py-2">分類（聖地orランダム）</th>
                <th className="border border-slate-300 px-3 py-2">
                  標高(m) {sortKey === "elevation" ? (sortOrder === "desc" ? "▼" : "▲") : ""}
                </th>
                <th className="border border-slate-300 px-3 py-2">
                  地磁気強度(nT) {sortKey === "magnetic" ? (sortOrder === "desc" ? "▼" : "▲") : ""}
                </th>
                <th className="border border-slate-300 px-3 py-2">偏角(°)</th>
                <th className="border border-slate-300 px-3 py-2">伏角(°)</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((spot) => {
                const detail = details[spot.id];
                return (
                  <tr
                    key={spot.id}
                    className={spot.type === "sacred" ? "bg-rose-50" : "bg-sky-50"}
                  >
                    <td className="border border-slate-300 px-3 py-2 font-medium">{spot.name}</td>
                    <td className="border border-slate-300 px-3 py-2">
                      {spot.type === "sacred" ? "聖地" : "ランダム"}
                    </td>
                    <td className="border border-slate-300 px-3 py-2">
                      {detail?.elevation != null ? detail.elevation : "未取得"}
                    </td>
                    <td className="border border-slate-300 px-3 py-2">
                      {detail ? detail.magnetic.totalIntensityNt : "未取得"}
                    </td>
                    <td className="border border-slate-300 px-3 py-2">
                      {detail ? detail.magnetic.declinationDeg : "未取得"}
                    </td>
                    <td className="border border-slate-300 px-3 py-2">
                      {detail ? detail.magnetic.inclinationDeg : "未取得"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
