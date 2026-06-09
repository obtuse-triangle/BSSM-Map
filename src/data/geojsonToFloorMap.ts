import type { CampusFeatureCollection } from "../schemas/campusGeojson";
import type { FloorMapData, Floor, FloorElement } from "../types";
import campusRaw from "./campus.json";

function computeAABB(
  ring: number[][],
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Convert a canonical CampusFeatureCollection (validated GeoJSON with
 * normalized [0,1] coordinates) to the legacy FloorMapData rectangle format.
 * Each polygon feature is reduced to its axis-aligned bounding box.
 * Only features where `properties.interactive === true` are included.
 * Features are grouped by `properties.level_id` into per-floor element arrays.
 */
export function geojsonToFloorMapData(
  geojson: CampusFeatureCollection,
): FloorMapData {
  const floors: Record<string, Floor> = {};
  const interactiveFeatures = geojson.features.filter(
    (f) => f.properties.interactive,
  );

  const groups = new Map<string, CampusFeatureCollection["features"]>();
  for (const feature of interactiveFeatures) {
    const levelId = feature.properties.level_id;
    const group = groups.get(levelId);
    if (group) {
      group.push(feature);
    } else {
      groups.set(levelId, [feature]);
    }
  }

  const sortedLevels = [...groups.keys()].sort(
    (a, b) => Number(a) - Number(b),
  );

  for (const levelId of sortedLevels) {
    const features = groups.get(levelId)!;
    const elements: FloorElement[] = features.map((feature, idx) => {
      const ring = feature.geometry.coordinates[0];
      const { minX, minY, maxX, maxY } = computeAABB(ring);

      return {
        id: idx + 1,
        name: feature.properties.name_ko,
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
        interactive: true,
      };
    });

    floors[levelId] = {
      label: `${levelId}층`,
      elements,
    };
  }

  return {
    version: 2,
    school: "BSSM",
    floors,
  };
}

/**
 * Pre-built FloorMapData for BSSM derived from campus GeoJSON.
 * An alternative to the legacy bssmFloorMap (which reads from bssm.json).
 */
export const bssmFloorMapFromGeojson: FloorMapData =
  geojsonToFloorMapData(campusRaw as unknown as CampusFeatureCollection);
