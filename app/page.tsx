import dynamic from "next/dynamic";

const PowerSpotDashboard = dynamic(() => import("@/components/PowerSpotDashboard"), {
  ssr: false,
  loading: () => <p className="p-8 text-center text-slate-600">地図を読み込み中...</p>,
});

export default function HomePage() {
  return <PowerSpotDashboard />;
}
