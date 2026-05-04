export type SpotType = "sacred" | "random";

export type Spot = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  type: SpotType;
};

export const SACRED_SPOTS: Spot[] = [
  { id: "osorezan", name: "恐山", lat: 41.3264, lon: 141.0916, type: "sacred" },
  { id: "tateyama", name: "立山", lat: 36.5753, lon: 137.6196, type: "sacred" },
  {
    id: "kumano-nachi",
    name: "熊野那智大社",
    lat: 33.6764,
    lon: 135.8888,
    type: "sacred",
  },
  { id: "koyasan", name: "高野山", lat: 34.2122, lon: 135.5853, type: "sacred" },
  { id: "izumo", name: "出雲大社", lat: 35.4021, lon: 132.6855, type: "sacred" },
  { id: "bungui", name: "分杭峠", lat: 35.8097, lon: 138.0423, type: "sacred" },
  {
    id: "togakushi",
    name: "戸隠神社",
    lat: 36.7441,
    lon: 138.0853,
    type: "sacred",
  },
  { id: "ise", name: "伊勢神宮", lat: 34.455, lon: 136.7254, type: "sacred" },
  { id: "yakushima", name: "屋久島", lat: 30.3363, lon: 130.5336, type: "sacred" },
  { id: "kifune", name: "貴船神社", lat: 35.1214, lon: 135.763, type: "sacred" },
];

export const RANDOM_SPOTS: Spot[] = [
  { id: "random-1", name: "ランダム地点1: 札幌市郊外", lat: 43.0621, lon: 141.3544, type: "random" },
  { id: "random-2", name: "ランダム地点2: 秋田県横手市", lat: 39.3113, lon: 140.5533, type: "random" },
  { id: "random-3", name: "ランダム地点3: 群馬県前橋市", lat: 36.3912, lon: 139.0608, type: "random" },
  { id: "random-4", name: "ランダム地点4: 東京都八王子市", lat: 35.6662, lon: 139.316, type: "random" },
  { id: "random-5", name: "ランダム地点5: 静岡県浜松市", lat: 34.7108, lon: 137.7261, type: "random" },
  { id: "random-6", name: "ランダム地点6: 大阪府堺市", lat: 34.5733, lon: 135.483, type: "random" },
  { id: "random-7", name: "ランダム地点7: 岡山県倉敷市", lat: 34.585, lon: 133.7717, type: "random" },
  { id: "random-8", name: "ランダム地点8: 愛媛県松山市", lat: 33.8396, lon: 132.7657, type: "random" },
  { id: "random-9", name: "ランダム地点9: 福岡県久留米市", lat: 33.3191, lon: 130.5083, type: "random" },
  { id: "random-10", name: "ランダム地点10: 鹿児島県霧島市", lat: 31.7406, lon: 130.763, type: "random" },
];

export const ALL_SPOTS: Spot[] = [...SACRED_SPOTS, ...RANDOM_SPOTS];
