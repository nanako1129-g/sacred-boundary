"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
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
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { EmaCard } from "@/components/ui/ema-card";

type SpotDetail = {
  elevation: number | null;
  source: string;
  magnetic: ReturnType<typeof estimateGeomagneticData>;
};

type WikiDetail = {
  status: "loading" | "success" | "error";
  extract?: string;
  imageUrl?: string;
  pageUrl?: string;
};

type InsightDetail = {
  status: "loading" | "success" | "error";
  text?: string;
  summary?: string;
  legendKeywords?: string[];
  era?: string;
  traditionType?: string;
  evidence?: string[];
  generatedAt?: string;
  sourceModel?: string;
  isFallback?: boolean;
};

type VisitDraft = {
  visitedOn: string;
  memo: string;
  photos: File[];
};

function isHttpUrl(value: string) {
  return /^https?:\/\/\S+$/i.test(value);
}

const DISCOVERED_SPOTS_STORAGE_KEY = "discovered-sacred-spot-ids";

const FIXED_SPOT_MEDIA: Record<
  string,
  { imageUrl: string; caption: string; sourceUrl?: string }
> = {
  熊野那智大社: {
    imageUrl: "https://loremflickr.com/900/420/japan,shrine,waterfall?lock=101",
    caption: "熊野那智エリアを想起させる社叢と聖域のイメージ",
    sourceUrl: "https://ja.wikipedia.org/wiki/%E7%86%8A%E9%87%8E%E9%82%A3%E6%99%BA%E5%A4%A7%E7%A4%BE",
  },
  恐山: {
    imageUrl: "https://loremflickr.com/900/420/japan,mountain,mist?lock=102",
    caption: "恐山の荒涼感を想起させる山岳イメージ",
    sourceUrl: "https://ja.wikipedia.org/wiki/%E6%81%90%E5%B1%B1",
  },
  立山: {
    imageUrl: "https://loremflickr.com/900/420/japan,alpine,mountain?lock=103",
    caption: "立山の高山帯を想起させる山岳イメージ",
    sourceUrl: "https://ja.wikipedia.org/wiki/%E7%AB%8B%E5%B1%B1%E9%80%A3%E5%B3%B0",
  },
};

function getSpotMapImageUrl(spot: Spot) {
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${spot.lat},${spot.lon}&zoom=11&size=900x420&markers=${spot.lat},${spot.lon},red-pushpin`;
}

function getSpotMapEmbedUrl(spot: Spot) {
  const latDelta = 0.06;
  const lonDelta = 0.08;
  const left = spot.lon - lonDelta;
  const right = spot.lon + lonDelta;
  const bottom = spot.lat - latDelta;
  const top = spot.lat + latDelta;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${left}%2C${bottom}%2C${right}%2C${top}&layer=mapnik&marker=${spot.lat}%2C${spot.lon}`;
}

function getPilgrimTitle(progressPercent: number) {
  if (progressPercent >= 100) {
    return "境界の語り部";
  }
  if (progressPercent >= 75) {
    return "異界の巡礼者";
  }
  if (progressPercent >= 50) {
    return "結界の探索者";
  }
  if (progressPercent >= 25) {
    return "霊地ウォーカー";
  }
  return "旅立ちの観測者";
}

function getPilgrimRank(progressPercent: number) {
  if (progressPercent >= 100) {
    return 5;
  }
  if (progressPercent >= 75) {
    return 4;
  }
  if (progressPercent >= 50) {
    return 3;
  }
  if (progressPercent >= 25) {
    return 2;
  }
  return 1;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getResonanceLabel(score: number) {
  if (score >= 85) {
    return "強い呼び声";
  }
  if (score >= 70) {
    return "境界が近い";
  }
  if (score >= 55) {
    return "静かな共鳴";
  }
  if (score >= 40) {
    return "微かな気配";
  }
  return "観測段階";
}

function calculateResonanceScore(params: {
  elevation: number;
  geomagF: number;
  wikiLength: number;
  keywordCount: number;
}) {
  const elevationScore = clamp(params.elevation / 30, 0, 30);
  const geomagDelta = Math.abs(params.geomagF - 46000);
  const geomagScore = clamp(geomagDelta / 250, 0, 30);
  const wikiScore = clamp(params.wikiLength / 70, 0, 20);
  const keywordScore = clamp(params.keywordCount * 4, 0, 20);
  const total = Math.round(elevationScore + geomagScore + wikiScore + keywordScore);

  return {
    total,
    label: getResonanceLabel(total),
    breakdown: {
      elevation: Math.round(elevationScore),
      geomagnetism: Math.round(geomagScore),
      history: Math.round(wikiScore),
      legend: Math.round(keywordScore),
    },
  };
}

function getResonanceReasons(breakdown: {
  elevation: number;
  geomagnetism: number;
  history: number;
  legend: number;
}) {
  const entries: Array<{ key: string; label: string; value: number; max: number; strongText: string; weakText: string }> =
    [
      {
        key: "elevation",
        label: "標高",
        value: breakdown.elevation,
        max: 30,
        strongText: "標高が高く、地上の境界感を生みやすい地形です。",
        weakText: "標高による非日常性は控えめです。",
      },
      {
        key: "geomagnetism",
        label: "地磁気",
        value: breakdown.geomagnetism,
        max: 30,
        strongText: "地磁気の偏差が大きく、場の特異性が強く出ています。",
        weakText: "地磁気は平均域に近く、特異性は小さめです。",
      },
      {
        key: "history",
        label: "歴史情報",
        value: breakdown.history,
        max: 20,
        strongText: "歴史・由来の記述が厚く、意味づけの層が豊富です。",
        weakText: "歴史情報がまだ少なく、解釈の材料が限定的です。",
      },
      {
        key: "legend",
        label: "伝承",
        value: breakdown.legend,
        max: 20,
        strongText: "伝承キーワードが多く、物語性が強い地点です。",
        weakText: "伝承キーワードが少なく、物語性はこれからです。",
      },
    ];

  const sorted = [...entries].sort((a, b) => b.value - a.value);
  const top = sorted[0];
  const second = sorted[1];
  const weakest = [...entries].sort((a, b) => a.value - b.value)[0];
  const topRate = top.value / top.max;
  const secondRate = second.value / second.max;
  const weakRate = weakest.value / weakest.max;

  const leadText = topRate >= 0.45 ? top.strongText : top.weakText;
  const supportText =
    secondRate >= 0.45
      ? `${second.label}も支えになっていて、複合的に雰囲気を押し上げています。`
      : `${second.label}は伸びしろがあり、今後の情報追加で評価が変わる余地があります。`;
  const cautionText = weakRate < 0.25 ? weakest.weakText : "";

  return [leadText, supportText, cautionText].filter(Boolean);
}

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
  return (await res.json()) as { extract: string; imageUrl?: string; pageUrl?: string };
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
  return (await res.json()) as {
    insight: string;
    summary?: string;
    legend_keywords?: string[];
    era?: string;
    tradition_type?: string;
    evidence?: string[];
    generated_at?: string;
    model?: string;
    fallback?: boolean;
  };
}

async function fetchCachedInsight(spotName: string) {
  const res = await fetch(`/api/insight/cache?name=${encodeURIComponent(spotName)}`);
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error("考察キャッシュの取得に失敗しました。");
  }
  return (await res.json()) as {
    insight: string;
    generated_at: string;
    summary?: string;
    legend_keywords?: string[];
    era?: string;
    tradition_type?: string;
    evidence?: string[];
  };
}

async function retry<T>(fn: () => Promise<T>, retries = 2, delayMs = 400): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i <= retries; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < retries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * (i + 1)));
      }
    }
  }
  throw lastError;
}

export default function PowerSpotDashboard() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [details, setDetails] = useState<Record<string, SpotDetail>>({});
  const [activeSpotId, setActiveSpotId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wikiDetails, setWikiDetails] = useState<Record<string, WikiDetail>>({});
  const [insightDetails, setInsightDetails] = useState<Record<string, InsightDetail>>({});
  const [isEvidenceExpanded, setIsEvidenceExpanded] = useState(false);
  const [isKeywordsExpanded, setIsKeywordsExpanded] = useState(false);
  const [discoveredSpotIds, setDiscoveredSpotIds] = useState<string[]>([]);
  const [justDiscoveredSpotId, setJustDiscoveredSpotId] = useState<string | null>(null);
  const [titleToast, setTitleToast] = useState<string | null>(null);
  const [discoveryToast, setDiscoveryToast] = useState<string | null>(null);
  const [failedImageSpotIds, setFailedImageSpotIds] = useState<Record<string, boolean>>({});
  const [sortKey, setSortKey] = useState<"elevation" | "magnetic">("elevation");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [isVisitModalOpen, setIsVisitModalOpen] = useState(false);
  const [visitSpot, setVisitSpot] = useState<Spot | null>(null);
  const [isVisitSubmitting, setIsVisitSubmitting] = useState(false);
  const [visitMessage, setVisitMessage] = useState<string | null>(null);
  const [visitDraft, setVisitDraft] = useState<VisitDraft>({
    visitedOn: new Date().toISOString().slice(0, 10),
    memo: "",
    photos: [],
  });
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authUserEmail, setAuthUserEmail] = useState<string | null>(null);
  const totalSacredSpots = useMemo(
    () => ALL_SPOTS.filter((spot) => spot.type === "sacred").length,
    [],
  );
  const discoveredSacredCount = useMemo(
    () =>
      discoveredSpotIds.filter((id) =>
        ALL_SPOTS.some((spot) => spot.id === id && spot.type === "sacred"),
      ).length,
    [discoveredSpotIds],
  );
  const discoveredProgressPercent =
    totalSacredSpots > 0 ? Math.round((discoveredSacredCount / totalSacredSpots) * 100) : 0;
  const pilgrimTitle = getPilgrimTitle(discoveredProgressPercent);
  const pilgrimRank = getPilgrimRank(discoveredProgressPercent);
  const prevPilgrimRankRef = useRef<number | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setIsLoggedIn(!!data.session);
      setAuthUserEmail(data.session?.user.email ?? null);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session);
      setAuthUserEmail(session?.user.email ?? null);
    });

    return () => authListener.subscription.unsubscribe();
  }, [supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setVisitMessage("ログアウトしました。");
  };

  useEffect(() => {
    const loadAll = async () => {
      const entries = await Promise.allSettled(
        ALL_SPOTS.map(async (spot) => {
          const elevation = await retry(() => fetchElevation(spot.lat, spot.lon), 2, 300);
          return [
            spot.id,
            {
              ...elevation,
              magnetic: estimateGeomagneticData(spot.lat, spot.lon),
            },
          ] as const;
        }),
      );

      const successEntries = entries
        .filter((entry): entry is PromiseFulfilledResult<readonly [string, SpotDetail]> => {
          return entry.status === "fulfilled";
        })
        .map((entry) => entry.value);

      if (successEntries.length) {
        setDetails((prev) => ({
          ...prev,
          ...Object.fromEntries(successEntries),
        }));
      }

      if (entries.some((entry) => entry.status === "rejected")) {
        setError("一部の標高データの取得に失敗しました。");
      }
    };

    void loadAll();
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DISCOVERED_SPOTS_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        setDiscoveredSpotIds(parsed.filter((id): id is string => typeof id === "string"));
      }
    } catch {
      // localStorage が不正な場合は無視して続行
    }
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
  const activeSacredSpot = activeSpot?.type === "sacred" ? activeSpot : null;
  const activeDetail = activeSpot ? details[activeSpot.id] : null;
  const activeWiki = activeSpot ? wikiDetails[activeSpot.id] : null;
  const activeSpotFixedMedia = activeSpot ? FIXED_SPOT_MEDIA[activeSpot.name] : undefined;
  const activeWikiImageUrl =
    activeSpotFixedMedia?.imageUrl ??
    activeWiki?.imageUrl ??
    (activeSpot ? getSpotMapImageUrl(activeSpot) : undefined);
  const activeWikiPageUrl = activeSpotFixedMedia?.sourceUrl ?? activeWiki?.pageUrl;
  const activeImageCaption =
    activeSpotFixedMedia?.caption ??
    (activeWiki?.imageUrl ? "Wikipedia由来の写真" : "地点周辺の地図イメージ");
  const shouldUseMapEmbed =
    activeSpot
      ? !activeSpotFixedMedia &&
        (activeWiki?.status === "error" || !!failedImageSpotIds[activeSpot.id] || !activeWiki?.imageUrl)
      : false;
  const activeInsight = activeSpot ? insightDetails[activeSpot.id] : null;
  const activeResonance = useMemo(() => {
    if (
      !activeSpot ||
      activeSpot.type !== "sacred" ||
      !activeDetail ||
      activeDetail.elevation == null ||
      !activeWiki?.extract
    ) {
      return null;
    }
    return calculateResonanceScore({
      elevation: activeDetail.elevation,
      geomagF: activeDetail.magnetic.totalIntensityNt,
      wikiLength: activeWiki.extract.length,
      keywordCount: activeInsight?.legendKeywords?.length ?? 0,
    });
  }, [activeSpot, activeDetail, activeWiki, activeInsight]);
  const activeResonanceReasons = useMemo(() => {
    if (!activeResonance) {
      return [];
    }
    return getResonanceReasons(activeResonance.breakdown);
  }, [activeResonance]);
  const visibleKeywords = isKeywordsExpanded
    ? (activeInsight?.legendKeywords ?? [])
    : (activeInsight?.legendKeywords ?? []).slice(0, 4);
  const visibleEvidence = isEvidenceExpanded
    ? (activeInsight?.evidence ?? [])
    : (activeInsight?.evidence ?? []).slice(0, 2);

  useEffect(() => {
    setIsEvidenceExpanded(false);
    setIsKeywordsExpanded(false);
  }, [activeSpotId]);

  useEffect(() => {
    const prevRank = prevPilgrimRankRef.current;
    prevPilgrimRankRef.current = pilgrimRank;

    if (prevRank == null) {
      return;
    }
    if (pilgrimRank <= prevRank || !justDiscoveredSpotId) {
      return;
    }

    setTitleToast(`称号アップ: ${pilgrimTitle}`);
    const timer = setTimeout(() => {
      setTitleToast(null);
    }, 2800);
    return () => clearTimeout(timer);
  }, [pilgrimRank, pilgrimTitle, justDiscoveredSpotId]);

  useEffect(() => {
    if (!justDiscoveredSpotId) {
      return;
    }
    const discoveredSpot = ALL_SPOTS.find((spot) => spot.id === justDiscoveredSpotId);
    if (!discoveredSpot || discoveredSpot.type !== "sacred") {
      return;
    }
    setDiscoveryToast(`新発見 +1: ${discoveredSpot.name}`);
    const timer = setTimeout(() => {
      setDiscoveryToast(null);
    }, 2200);
    return () => clearTimeout(timer);
  }, [justDiscoveredSpotId]);

  const handleSpotClick = async (spot: Spot) => {
    setActiveSpotId(spot.id);
    setError(null);
    setJustDiscoveredSpotId(null);

    if (spot.type === "sacred" && !discoveredSpotIds.includes(spot.id)) {
      const nextDiscovered = [...discoveredSpotIds, spot.id];
      setDiscoveredSpotIds(nextDiscovered);
      setJustDiscoveredSpotId(spot.id);
      try {
        localStorage.setItem(DISCOVERED_SPOTS_STORAGE_KEY, JSON.stringify(nextDiscovered));
      } catch {
        // 保存失敗時もUIは継続
      }
    }

    let currentDetail = details[spot.id] ?? null;

    if (!currentDetail) {
      try {
        setLoadingId(spot.id);
        const elevation = await retry(() => fetchElevation(spot.lat, spot.lon), 2, 300);
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
        const wiki = await retry(() => fetchWikipediaSummary(spot.name), 1, 400);
        currentWikiSummary = wiki.extract;
        setWikiDetails((prev) => ({
          ...prev,
          [spot.id]: {
            status: "success",
            extract: wiki.extract,
            imageUrl: wiki.imageUrl,
            pageUrl: wiki.pageUrl,
          },
        }));
      } catch {
        currentWikiSummary = `${spot.name}は日本各地で語り継がれる聖地のひとつとして知られる地点。`;
        setWikiDetails((prev) => ({
          ...prev,
          [spot.id]: {
            status: "error",
          },
        }));
      }
    }

    const currentInsightState = insightDetails[spot.id];
    const shouldFetchInsight = !currentInsightState || currentInsightState.status === "error";

    if (
      spot.type === "sacred" &&
      currentDetail &&
      currentDetail.elevation != null &&
      currentWikiSummary &&
      shouldFetchInsight
    ) {
      setInsightDetails((prev) => ({
        ...prev,
        [spot.id]: { status: "loading" },
      }));

      try {
        const cachedInsight = await fetchCachedInsight(spot.name);
        if (cachedInsight?.insight) {
          setInsightDetails((prev) => ({
            ...prev,
            [spot.id]: {
              status: "success",
              text: cachedInsight.insight,
              summary: cachedInsight.summary,
              legendKeywords: cachedInsight.legend_keywords ?? [],
              era: cachedInsight.era,
              traditionType: cachedInsight.tradition_type,
              evidence: cachedInsight.evidence ?? [],
              generatedAt: cachedInsight.generated_at,
            },
          }));
          return;
        }

        const insight = await fetchInsight({
          name: spot.name,
          elevation: currentDetail.elevation,
          geomagF: currentDetail.magnetic.totalIntensityNt,
          wikiSummary: currentWikiSummary,
        });
        setInsightDetails((prev) => ({
          ...prev,
          [spot.id]: {
            status: "success",
            text: insight.insight,
            summary: insight.summary,
            legendKeywords: insight.legend_keywords ?? [],
            era: insight.era,
            traditionType: insight.tradition_type,
            evidence: insight.evidence ?? [],
            generatedAt: insight.generated_at,
            sourceModel: insight.model,
            isFallback: insight.fallback,
          },
        }));
      } catch {
        setInsightDetails((prev) => ({
          ...prev,
          [spot.id]: { status: "error" },
        }));
      }
    }
  };

  const openVisitModal = (spot: Spot) => {
    setVisitSpot(spot);
    setVisitMessage(null);
    setVisitDraft({
      visitedOn: new Date().toISOString().slice(0, 10),
      memo: "",
      photos: [],
    });
    setIsVisitModalOpen(true);
  };

  const closeVisitModal = () => {
    setIsVisitModalOpen(false);
    setVisitSpot(null);
    setIsVisitSubmitting(false);
  };

  const handleVisitPhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList) {
      return;
    }
    setVisitDraft((prev) => ({
      ...prev,
      photos: Array.from(fileList).slice(0, 3),
    }));
  };

  const handleVisitSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!visitSpot) {
      return;
    }
    if (!isLoggedIn) {
      setVisitMessage("記録の保存にはログインが必要です。");
      return;
    }

    setIsVisitSubmitting(true);
    setVisitMessage(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setVisitMessage("ログイン状態を確認できませんでした。再ログインをお試しください。");
        return;
      }

      const formData = new FormData();
      formData.append("spotId", visitSpot.id);
      formData.append("visitedOn", visitDraft.visitedOn);
      formData.append("memo", visitDraft.memo);
      visitDraft.photos.forEach((photo) => {
        formData.append("photos", photo);
      });

      const response = await fetch("/api/visits", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const failed = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(failed?.error ?? "訪問記録の保存に失敗しました。");
      }

      setVisitMessage(`${visitSpot.name} の訪問記録を保存しました。`);
      setTimeout(() => {
        closeVisitModal();
      }, 900);
    } catch {
      setVisitMessage("保存中にエラーが発生しました。もう一度お試しください。");
    } finally {
      setIsVisitSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-8">
      <div className="flex items-center justify-end gap-2">
        {isLoggedIn ? (
          <>
            <p className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
              ログイン中: {authUserEmail ?? "ユーザー"}
            </p>
            <button
              type="button"
              onClick={() => {
                void handleSignOut();
              }}
              className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 transition hover:bg-slate-50"
            >
              ログアウト
            </button>
          </>
        ) : (
          <a
            href="/login"
            className="rounded-md border border-torii/40 bg-white px-3 py-1 text-xs font-medium text-torii transition hover:bg-torii/5"
          >
            ログイン
          </a>
        )}
      </div>
      {titleToast && (
        <div className="fixed right-4 top-4 z-[1000] animate-pulse rounded-lg border border-amber-300 bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-900 shadow-lg">
          {titleToast}
        </div>
      )}
      {discoveryToast && (
        <div className="fixed right-4 top-16 z-[999] animate-pulse rounded-lg border border-emerald-300 bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-900/95 shadow">
          {discoveryToast}
        </div>
      )}
      <h1 className="text-2xl font-bold md:text-3xl">
        パワースポット環境データ分析（聖地 vs ランダム）
      </h1>
      <EmaCard className="border-amber-200 bg-amber-50 p-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <p className="font-semibold text-amber-900">巡礼進捗</p>
          <p className="text-amber-800">
            発見済み聖地 {discoveredSacredCount}/{totalSacredSpots}
          </p>
        </div>
        <p className="mb-2 text-xs font-semibold text-amber-900">現在の称号: {pilgrimTitle}</p>
        <div className="h-2 w-full overflow-hidden rounded-full bg-amber-100">
          <div
            className="h-full rounded-full bg-amber-400 transition-all duration-500"
            style={{ width: `${discoveredProgressPercent}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-amber-800">
          達成率: {discoveredProgressPercent}%（聖地をクリックすると記録されます）
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!activeSacredSpot}
            onClick={() => {
              if (activeSacredSpot) {
                openVisitModal(activeSacredSpot);
              }
            }}
            className="rounded-md bg-torii px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#b83e26] disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            自分のデータを登録する
          </button>
          <a
            href="/goshuin"
            className="rounded-md border border-gold-soft/80 bg-white px-3 py-2 text-xs font-semibold text-indigo-deep transition hover:bg-gold-soft/10"
          >
            登録したデータを見る
          </a>
        </div>
        {!activeSacredSpot && (
          <p className="mt-2 text-xs text-amber-800/90">
            先に地図上の聖地ピンを選ぶと、訪問記録モーダルを開けます。
          </p>
        )}
      </EmaCard>

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
                {activeSpot.type === "sacred" && justDiscoveredSpotId === activeSpot.id && (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                    新発見
                  </span>
                )}
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
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openVisitModal(activeSpot)}
                      className="rounded-md bg-torii px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#b83e26]"
                    >
                      訪問を記録する
                    </button>
                    {!isLoggedIn && (
                      <span className="text-xs text-rose-800">
                        保存には
                        <a href="/login" className="mx-1 underline">
                          ログイン
                        </a>
                        が必要です（閲覧はこのまま可能）
                      </span>
                    )}
                  </div>
                  <p className="mb-1 font-semibold text-rose-900">歴史・由来</p>
                  {activeWiki?.status === "loading" && <p>取得中...</p>}
                  {activeWiki?.status === "success" && (
                    <div className="space-y-2">
                      {activeWikiImageUrl && (
                        <>
                          {shouldUseMapEmbed && activeSpot ? (
                            <iframe
                              src={getSpotMapEmbedUrl(activeSpot)}
                              title={`${activeSpot.name}周辺地図`}
                              className="h-40 w-full rounded-md border-0"
                              loading="lazy"
                            />
                          ) : (
                            <img
                              src={activeWikiImageUrl}
                              alt={`${activeSpot.name}の写真`}
                              className="h-40 w-full rounded-md object-cover"
                              loading="lazy"
                              onError={() => {
                                if (!activeSpot) {
                                  return;
                                }
                                setFailedImageSpotIds((prev) => ({ ...prev, [activeSpot.id]: true }));
                              }}
                            />
                          )}
                        </>
                      )}
                      {activeWikiImageUrl && (
                        <p className="text-[11px] text-rose-700">{activeImageCaption}</p>
                      )}
                      <p className="leading-relaxed">{activeWiki.extract}</p>
                      {activeWikiPageUrl && (
                        <a
                          href={activeWikiPageUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-rose-700 underline hover:text-rose-900"
                        >
                          Wikipediaで続きを読む
                        </a>
                      )}
                    </div>
                  )}
                  {activeWiki?.status === "error" && (
                    <div className="space-y-2">
                      {activeWikiImageUrl && (
                        <>
                          {shouldUseMapEmbed && activeSpot ? (
                            <iframe
                              src={getSpotMapEmbedUrl(activeSpot)}
                              title={`${activeSpot.name}周辺地図`}
                              className="h-40 w-full rounded-md border-0"
                              loading="lazy"
                            />
                          ) : (
                            <img
                              src={activeWikiImageUrl}
                              alt={`${activeSpot.name}の写真`}
                              className="h-40 w-full rounded-md object-cover"
                              loading="lazy"
                              onError={() => {
                                if (!activeSpot) {
                                  return;
                                }
                                setFailedImageSpotIds((prev) => ({ ...prev, [activeSpot.id]: true }));
                              }}
                            />
                          )}
                        </>
                      )}
                      {activeWikiImageUrl && (
                        <p className="text-[11px] text-rose-700">{activeImageCaption}</p>
                      )}
                      <p>情報を取得できませんでした</p>
                      {activeWikiPageUrl && (
                        <a
                          href={activeWikiPageUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-rose-700 underline hover:text-rose-900"
                        >
                          参考ページを開く
                        </a>
                      )}
                    </div>
                  )}
                  {!activeWiki && <p>取得中...</p>}
                </div>
              )}
              {activeSpot.type === "sacred" && (
                <div className="mt-3 rounded-md border border-violet-200 bg-violet-50 p-3">
                  <p className="mb-1 font-semibold text-violet-900">AIによる考察</p>
                  {activeInsight?.status === "loading" && <p>考察を生成中...</p>}
                  {activeInsight?.status === "success" && (
                    <div className="space-y-2">
                      {activeInsight.summary && (
                        <p className="rounded bg-violet-100 px-2 py-1 text-sm text-violet-900">
                          {activeInsight.summary}
                        </p>
                      )}
                      <p className="leading-relaxed whitespace-pre-wrap">{activeInsight.text}</p>
                      {(activeInsight.era || activeInsight.traditionType) && (
                        <p className="text-xs text-violet-800">
                          時代: {activeInsight.era ?? "不詳"} / 伝承類型:{" "}
                          {activeInsight.traditionType ?? "伝承"}
                        </p>
                      )}
                      {!!activeInsight.legendKeywords?.length && (
                        <div className="flex flex-wrap gap-1">
                          {visibleKeywords.map((keyword) => (
                            <span
                              key={keyword}
                              className="rounded-full bg-violet-200 px-2 py-0.5 text-xs text-violet-900"
                            >
                              {keyword}
                            </span>
                          ))}
                          {activeInsight.legendKeywords.length > 4 && (
                            <button
                              type="button"
                              onClick={() => setIsKeywordsExpanded((prev) => !prev)}
                              className="rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-800 underline hover:text-violet-900"
                            >
                              {isKeywordsExpanded ? "閉じる" : "もっと見る"}
                            </button>
                          )}
                        </div>
                      )}
                      {!!activeInsight.evidence?.length && (
                        <div className="text-xs text-violet-700">
                          <span className="font-semibold">出典:</span>{" "}
                          {visibleEvidence.map((source, index) => (
                            <span key={`${source}-${index}`}>
                              {index > 0 && " / "}
                              {isHttpUrl(source) ? (
                                <a
                                  href={source}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="underline hover:text-violet-900"
                                >
                                  {source}
                                </a>
                              ) : (
                                <span>{source}</span>
                              )}
                            </span>
                          ))}
                          {activeInsight.evidence.length > 2 && (
                            <>
                              {" "}
                              <button
                                type="button"
                                onClick={() => setIsEvidenceExpanded((prev) => !prev)}
                                className="underline hover:text-violet-900"
                              >
                                {isEvidenceExpanded ? "閉じる" : "もっと見る"}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                      {activeInsight.generatedAt && (
                        <p className="text-[11px] text-violet-600">
                          生成日時: {new Date(activeInsight.generatedAt).toLocaleString("ja-JP")}
                        </p>
                      )}
                      {activeInsight.sourceModel && (
                        <p className="text-[11px] text-violet-600">
                          生成元: {activeInsight.sourceModel}
                          {activeInsight.isFallback ? "（ローカル補完）" : ""}
                        </p>
                      )}
                    </div>
                  )}
                  {activeInsight?.status === "error" && <p>情報を取得できませんでした</p>}
                  {!activeInsight && (
                    <p className="text-slate-600">
                      標高と歴史情報が揃うと考察を生成します。
                    </p>
                  )}
                </div>
              )}
              {activeSpot.type === "sacred" && activeResonance && (
                <div className="mt-3 rounded-md border border-indigo-200 bg-indigo-50 p-3">
                  <p className="mb-1 font-semibold text-indigo-900">統合分析（呼ばれ度）</p>
                  <p className="text-sm text-indigo-900">
                    {activeResonance.total}/100 - {activeResonance.label}
                  </p>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-indigo-100">
                    <div
                      className="h-full rounded-full bg-indigo-400 transition-all duration-700"
                      style={{ width: `${activeResonance.total}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-indigo-800">
                    内訳: 標高 {activeResonance.breakdown.elevation} / 地磁気{" "}
                    {activeResonance.breakdown.geomagnetism} / 歴史情報{" "}
                    {activeResonance.breakdown.history} / 伝承キーワード{" "}
                    {activeResonance.breakdown.legend}
                  </p>
                  {!!activeResonanceReasons.length && (
                    <ul className="mt-2 space-y-1 text-xs text-indigo-900">
                      {activeResonanceReasons.map((reason) => (
                        <li key={reason}>- {reason}</li>
                      ))}
                    </ul>
                  )}
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

      <section className="rounded-xl border border-slate-300 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-slate-900">この分析で見ていること</h2>
        <p className="text-sm leading-relaxed text-slate-700">
          このアプリは、聖地とランダム地点の環境データを同じ条件で比較し、
          「なぜ特別な場所と感じられてきたか」を複合的に読み解きます。
          1つの要素だけで断定せず、複数の視点を重ねて解釈します。
        </p>
        <div className="mt-3 grid gap-2 text-xs text-slate-700 md:grid-cols-2">
          <p>
            <span className="font-semibold text-slate-900">1) 地形要素:</span>{" "}
            標高データ（国土地理院API）から、非日常性の出やすい地形かを確認。
          </p>
          <p>
            <span className="font-semibold text-slate-900">2) 地磁気要素:</span>{" "}
            日本平均（約46000nT）との差分を用いて、場の特異性を評価。
          </p>
          <p>
            <span className="font-semibold text-slate-900">3) 歴史要素:</span>{" "}
            Wikipedia要約の情報量や文脈から、由来の厚みを反映。
          </p>
          <p>
            <span className="font-semibold text-slate-900">4) 伝承要素:</span>{" "}
            AI考察から抽出した伝承キーワードで、物語性を加点。
          </p>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          ※「呼ばれ度」は体験を補助する探索指標です。学術的な断定ではなく、現地へ向かう動機づけを目的にしています。
        </p>
      </section>

      {isVisitModalOpen && visitSpot && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-indigo-deep/35 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-torii/30 bg-washi p-5 shadow-ema">
            <div className="mb-4">
              <p className="text-sm font-semibold text-torii">御朱印記録</p>
              <h3 className="text-xl font-bold text-indigo-deep">{visitSpot.name}</h3>
              <p className="mt-1 text-xs text-indigo-deep/70">
                感想と写真を残して、あとから御朱印帳ページで見返せます。
              </p>
            </div>

            <form className="space-y-4" onSubmit={handleVisitSubmit}>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-indigo-deep">訪問日</span>
                <input
                  type="date"
                  value={visitDraft.visitedOn}
                  onChange={(event) =>
                    setVisitDraft((prev) => ({
                      ...prev,
                      visitedOn: event.target.value,
                    }))
                  }
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-torii/30 transition focus:ring-2"
                  required
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block font-medium text-indigo-deep">感想</span>
                <textarea
                  value={visitDraft.memo}
                  onChange={(event) =>
                    setVisitDraft((prev) => ({
                      ...prev,
                      memo: event.target.value,
                    }))
                  }
                  rows={4}
                  placeholder="例: 境内の空気が澄んでいて、朝の参道がとても心地よかった。"
                  className="w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-torii/30 transition focus:ring-2"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block font-medium text-indigo-deep">写真（最大3枚）</span>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleVisitPhotoChange}
                  className="w-full rounded-md border border-dashed border-slate-300 bg-white px-3 py-2 text-xs text-indigo-deep"
                />
                {!!visitDraft.photos.length && (
                  <p className="mt-2 text-xs text-indigo-deep/80">
                    選択中: {visitDraft.photos.map((photo) => photo.name).join(" / ")}
                  </p>
                )}
              </label>

              {visitMessage && <p className="text-xs font-medium text-torii">{visitMessage}</p>}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeVisitModal}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
                >
                  閉じる
                </button>
                <button
                  type="submit"
                  disabled={isVisitSubmitting}
                  className="rounded-md bg-torii px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#b83e26] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isVisitSubmitting ? "保存中..." : "記録を保存"}
                </button>
              </div>
            </form>

            {!isLoggedIn && (
              <p className="mt-3 text-xs text-indigo-deep/70">
                ※ <a href="/login" className="underline">ログイン</a>後に Supabase へ訪問記録と写真を保存できます。
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
