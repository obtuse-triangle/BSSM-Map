import type {
  CampusWgs84Feature,
  CampusWgs84FeatureCollection,
} from "../schemas/campusWgs84Geojson";
import type { CampusFeatureCategory } from "../schemas/campusGeojson";
import type { OverlayCategoryStyle } from "./types";

// ─── Level filtering ────────────────────────────────────────────

export function filterFeaturesByLevel(
  data: CampusWgs84FeatureCollection,
  levelId: string,
): CampusWgs84Feature[] {
  return data.features.filter((f) => f.properties.level_id === levelId);
}

// ─── Available levels ───────────────────────────────────────────

export function getAvailableLevels(
  data: CampusWgs84FeatureCollection,
): string[] {
  const levels = new Set(data.features.map((f) => f.properties.level_id));
  return [...levels].sort();
}

// ─── Feature centroid (average of outer-ring coordinates) ───────

export function getFeatureLngLat(
  feature: CampusWgs84Feature,
): [number, number] {
  const outerRing = feature.geometry.coordinates[0];
  // Strip the closing coordinate if it duplicates the first
  const ring =
    outerRing[0][0] === outerRing[outerRing.length - 1][0] &&
    outerRing[0][1] === outerRing[outerRing.length - 1][1]
      ? outerRing.slice(0, -1)
      : outerRing;

  let lng = 0;
  let lat = 0;
  for (const [l, n] of ring) {
    lng += l;
    lat += n;
  }
  return [lng / ring.length, lat / ring.length];
}

// ─── Bounding box over multiple features ────────────────────────

export function getFeatureBounds(
  features: CampusWgs84Feature[],
): { north: number; south: number; east: number; west: number } {
  let north = -Infinity;
  let south = Infinity;
  let east = -Infinity;
  let west = Infinity;

  for (const feature of features) {
    for (const ring of feature.geometry.coordinates) {
      for (const [lng, lat] of ring) {
        if (lng < west) west = lng;
        if (lng > east) east = lng;
        if (lat < south) south = lat;
        if (lat > north) north = lat;
      }
    }
  }

  return { north, south, east, west };
}

// ─── Default category styles ────────────────────────────────────

export const DEFAULT_CATEGORY_STYLES: Record<
  CampusFeatureCategory,
  OverlayCategoryStyle
> = {
  room: {
    fillColor: "#e8e8e8",
    fillOpacity: 0.7,
    strokeColor: "#999999",
    strokeWidth: 1,
  },
  classroom: {
    fillColor: "#4fc3f7",
    fillOpacity: 0.5,
    strokeColor: "#0288d1",
    strokeWidth: 1,
  },
  office: {
    fillColor: "#ff8a65",
    fillOpacity: 0.6,
    strokeColor: "#d84315",
    strokeWidth: 1,
  },
  corridor: {
    fillColor: "#f5f5f5",
    fillOpacity: 0.4,
    strokeColor: "#bdbdbd",
    strokeWidth: 0.5,
  },
  stair: {
    fillColor: "#81c784",
    fillOpacity: 0.6,
    strokeColor: "#388e3c",
    strokeWidth: 1,
  },
  elevator: {
    fillColor: "#90a4ae",
    fillOpacity: 0.7,
    strokeColor: "#546e7a",
    strokeWidth: 1,
  },
  restroom: {
    fillColor: "#ce93d8",
    fillOpacity: 0.6,
    strokeColor: "#8e24aa",
    strokeWidth: 1,
  },
  outdoor: {
    fillColor: "#a5d6a7",
    fillOpacity: 0.5,
    strokeColor: "#43a047",
    strokeWidth: 1,
  },
  parking: {
    fillColor: "#bdbdbd",
    fillOpacity: 0.6,
    strokeColor: "#757575",
    strokeWidth: 1,
  },
  facility: {
    fillColor: "#ffd54f",
    fillOpacity: 0.6,
    strokeColor: "#f57f17",
    strokeWidth: 1,
  },
  structural: {
    fillColor: "#bcaaa4",
    fillOpacity: 0.5,
    strokeColor: "#795548",
    strokeWidth: 1,
  },
  unknown: {
    fillColor: "#eeeeee",
    fillOpacity: 0.5,
    strokeColor: "#9e9e9e",
    strokeWidth: 1,
  },
};
