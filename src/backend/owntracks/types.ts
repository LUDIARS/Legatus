/**
 * OwnTracks payload (`_type='location'`) の最小型定義.
 * spec: <https://owntracks.org/booklet/tech/json/>
 */
export interface OwntracksLocation {
  _type: "location";
  /** 緯度 (deg) */
  lat: number;
  /** 経度 (deg) */
  lon: number;
  /** Unix epoch (秒) */
  tst: number;
  /** 精度 (m) */
  acc?: number;
  /** 標高 (m) */
  alt?: number;
  /** バッテリー (%) */
  batt?: number;
  /** 速度 (km/h) */
  vel?: number;
  /** コンパス方位 (deg) */
  cog?: number;
  /** track id (端末略号、例: "iP") */
  tid?: string;
  /** 接続種別 ("w" wifi / "m" mobile / "o" offline) */
  conn?: string;
}

export interface ParsedOwntracksTopic {
  user: string;
  device: string;
}

/**
 * Buffer に積む正規化済み LocationEvent. user は OwnTracks topic の名前空間 (Cernere user_id ではない).
 * Cernere user_id は forward 時に session から解決する.
 */
export interface LocationEvent {
  topicUser: string;
  device: string;
  lat: number;
  lon: number;
  /** ISO 8601 UTC */
  ts: string;
  acc?: number;
  alt?: number;
  vel?: number;
  cog?: number;
}

/**
 * 5 分 flush で生成される移動サマリ. Memoria に投げる payload.
 */
export interface LocationSummary {
  /** ISO 8601 UTC. flush window 開始 */
  intervalStart: string;
  /** ISO 8601 UTC. flush window 終了 (実際の最終 event tst) */
  intervalEnd: string;
  start: { lat: number; lon: number };
  end: { lat: number; lon: number };
  /** 連続 event 間の累積距離 (m) */
  totalDistanceMeters: number;
  /** start ↔ end の直線距離 (m) */
  netDistanceMeters: number;
  maxSpeedKmh?: number;
  meanSpeedKmh?: number;
  pointCount: number;
  deviceIds: string[];
}
