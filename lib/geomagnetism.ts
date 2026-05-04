export type GeomagneticData = {
  totalIntensityNt: number;
  declinationDeg: number;
  inclinationDeg: number;
};

// 軽量な近似モデル。緯度・経度から地磁気指標を一貫して算出する。
export function estimateGeomagneticData(lat: number, lon: number): GeomagneticData {
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;

  const totalIntensityNt =
    44000 + 3500 * Math.sin(latRad) + 700 * Math.cos(lonRad * 1.4);
  const declinationDeg = -7 + 3 * Math.sin(lonRad * 0.9) - 1.8 * Math.cos(latRad);
  const inclinationDeg = 42 + 10 * Math.sin(latRad) + 2.5 * Math.cos(lonRad);

  return {
    totalIntensityNt: Number(totalIntensityNt.toFixed(1)),
    declinationDeg: Number(declinationDeg.toFixed(2)),
    inclinationDeg: Number(inclinationDeg.toFixed(2)),
  };
}
