"use client";

import "leaflet/dist/leaflet.css";

import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";

type PilgrimMapSpot = {
  spotName: string;
  lat: number;
  lon: number;
  latestVisitedOn: string;
  visitCount: number;
};

type PilgrimMapProps = {
  spots: PilgrimMapSpot[];
};

export default function GoshuinPilgrimMap({ spots }: PilgrimMapProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-amber-100">
      <MapContainer center={[36.2048, 138.2529]} zoom={5} scrollWheelZoom className="h-[520px] w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {spots.map((spot) => (
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
      </MapContainer>
    </div>
  );
}
