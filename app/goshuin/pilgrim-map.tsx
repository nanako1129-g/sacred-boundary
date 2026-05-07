"use client";

import "leaflet/dist/leaflet.css";

import { CircleMarker, MapContainer, Polyline, Popup, TileLayer } from "react-leaflet";

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

type PilgrimMapProps = {
  spots: PilgrimMapSpot[];
  routePoints: PilgrimRoutePoint[];
  viewMode: "spots" | "route" | "both";
};

export default function GoshuinPilgrimMap({ spots, routePoints, viewMode }: PilgrimMapProps) {
  const routeLinePositions: Array<[number, number]> = routePoints.map((point) => [point.lat, point.lon]);
  const showSpots = viewMode === "spots" || viewMode === "both";
  const showRoute = (viewMode === "route" || viewMode === "both") && routeLinePositions.length >= 2;

  return (
    <div className="overflow-hidden rounded-lg border border-amber-100">
      <MapContainer center={[36.2048, 138.2529]} zoom={5} scrollWheelZoom className="h-[520px] w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {showRoute && (
          <Polyline
            positions={routeLinePositions}
            pathOptions={{
              color: "#1F2A44",
              opacity: 0.85,
              weight: 4,
            }}
          />
        )}
        {showSpots &&
          spots.map((spot) => (
            <CircleMarker
              key={`${spot.spotName}-${spot.lat}-${spot.lon}`}
              center={[spot.lat, spot.lon]}
              radius={9}
              pathOptions={{
                color: "#D24A2E",
                fillColor: "#D24A2E",
                fillOpacity: 0.75,
                weight: 2,
              }}
            >
              <Popup>
                <div className="text-sm">
                  <p className="font-semibold">{spot.spotName}</p>
                  <p>訪問回数: {spot.visitCount} 回</p>
                  <p>最新訪問日: {new Date(spot.latestVisitedOn).toLocaleDateString("ja-JP")}</p>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        {(viewMode === "route" || viewMode === "both") &&
          routePoints.map((point, index) => (
            <CircleMarker
              key={point.id}
              center={[point.lat, point.lon]}
              radius={5}
              pathOptions={{
                color: "#1F2A44",
                fillColor: "#C8A96B",
                fillOpacity: 0.9,
                weight: 1.5,
              }}
            >
              <Popup>
                <div className="text-sm">
                  <p className="font-semibold">
                    第{index + 1}巡礼: {point.spotName}
                  </p>
                  <p>訪問日: {new Date(point.visitedOn).toLocaleDateString("ja-JP")}</p>
                </div>
              </Popup>
            </CircleMarker>
          ))}
      </MapContainer>
    </div>
  );
}
