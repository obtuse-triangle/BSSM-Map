import { describe, it, expect } from "vitest";
import { geojsonToFloorMapData } from "../../src/data/geojsonToFloorMap";
import type { CampusFeatureCollection } from "../../src/schemas/campusGeojson";

function feature(
  overrides?: Partial<CampusFeatureCollection["features"][number]>,
): CampusFeatureCollection["features"][number] {
  const defaults: CampusFeatureCollection["features"][number] = {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [0.1, 0],
          [0.1, 0.1],
          [0, 0.1],
          [0, 0],
        ],
      ],
    },
    properties: {
      name: "Room 101",
      name_ko: "룸101",
      level: 1,
      level_id: "1",
      building_id: "campus-main",
      category: "room",
      interactive: true,
      source: "test",
    },
  };
  return { ...defaults, ...overrides } as CampusFeatureCollection["features"][number];
}

function collection(
  features: CampusFeatureCollection["features"][number][],
): CampusFeatureCollection {
  return {
    type: "FeatureCollection",
    features,
    metadata: {
      coordinateSystem: "local",
      units: "source-normalized",
    },
  } as CampusFeatureCollection;
}

describe("geojsonToFloorMapData", () => {
  it("converts a simple rectangular feature to a FloorElement", () => {
    const geo = collection([feature()]);
    const result = geojsonToFloorMapData(geo);

    expect(result.version).toBe(2);
    expect(result.school).toBe("BSSM");
    expect(result.floors["1"]).toBeDefined();
    expect(result.floors["1"].label).toBe("1층");
    expect(result.floors["1"].elements).toHaveLength(1);
    expect(result.floors["1"].elements[0]).toEqual({
      id: 1,
      name: "룸101",
      x: 0,
      y: 0,
      width: 0.1,
      height: 0.1,
      interactive: true,
    });
  });

  it("groups features by level_id into separate floor keys", () => {
    const geo = collection([
      feature({ properties: { ...feature().properties, level_id: "1", name_ko: "Room A" } }),
      feature({ properties: { ...feature().properties, level_id: "2", name_ko: "Room B" } }),
      feature({ properties: { ...feature().properties, level_id: "1", name_ko: "Room C" } }),
    ]);
    const result = geojsonToFloorMapData(geo);

    expect(Object.keys(result.floors)).toEqual(["1", "2"]);
    expect(result.floors["1"].label).toBe("1층");
    expect(result.floors["2"].label).toBe("2층");
    expect(result.floors["1"].elements).toHaveLength(2);
    expect(result.floors["2"].elements).toHaveLength(1);
    expect(result.floors["1"].elements[0].name).toBe("Room A");
    expect(result.floors["1"].elements[1].name).toBe("Room C");
    expect(result.floors["2"].elements[0].name).toBe("Room B");
  });

  it("computes bounding box for a non-rectangular (L-shaped) polygon", () => {
    const lShapeRing = [
      [0, 0],
      [0.2, 0],
      [0.2, 0.05],
      [0.1, 0.05],
      [0.1, 0.1],
      [0, 0.1],
      [0, 0],
    ];
    const geo = collection([
      feature({
        geometry: {
          type: "Polygon",
          coordinates: [lShapeRing],
        },
      }),
    ]);
    const result = geojsonToFloorMapData(geo);
    const el = result.floors["1"].elements[0];

    expect(el.x).toBe(0);
    expect(el.y).toBe(0);
    expect(el.width).toBeCloseTo(0.2, 10);
    expect(el.height).toBeCloseTo(0.1, 10);
  });

  it("filters out non-interactive features", () => {
    const geo = collection([
      feature({ properties: { ...feature().properties, name_ko: "A", interactive: true } }),
      feature({ properties: { ...feature().properties, name_ko: "B", interactive: false } }),
      feature({ properties: { ...feature().properties, name_ko: "C", interactive: true } }),
    ]);
    const result = geojsonToFloorMapData(geo);

    expect(result.floors["1"].elements).toHaveLength(2);
    expect(result.floors["1"].elements[0].name).toBe("A");
    expect(result.floors["1"].elements[1].name).toBe("C");
  });

  it("returns empty floors for empty feature collection", () => {
    const geo = collection([]);
    const result = geojsonToFloorMapData(geo);

    expect(Object.keys(result.floors)).toEqual([]);
  });

  it("returns empty floors when all features are non-interactive", () => {
    const geo = collection([
      feature({ properties: { ...feature().properties, interactive: false } }),
      feature({ properties: { ...feature().properties, interactive: false } }),
    ]);
    const result = geojsonToFloorMapData(geo);

    expect(Object.keys(result.floors)).toEqual([]);
  });

  it("assigns sequential element IDs within each floor", () => {
    const geo = collection([
      feature({ properties: { ...feature().properties, level_id: "1", name_ko: "First" } }),
      feature({ properties: { ...feature().properties, level_id: "1", name_ko: "Second" } }),
      feature({ properties: { ...feature().properties, level_id: "1", name_ko: "Third" } }),
    ]);
    const result = geojsonToFloorMapData(geo);

    expect(result.floors["1"].elements[0].id).toBe(1);
    expect(result.floors["1"].elements[1].id).toBe(2);
    expect(result.floors["1"].elements[2].id).toBe(3);
  });

  it("produces correct bounding box when polygon edges are not axis-aligned", () => {
    const rotatedRing = [
      [0.05, 0.02],
      [0.15, 0.04],
      [0.14, 0.12],
      [0.04, 0.10],
      [0.05, 0.02],
    ];
    const geo = collection([
      feature({
        geometry: {
          type: "Polygon",
          coordinates: [rotatedRing],
        },
      }),
    ]);
    const result = geojsonToFloorMapData(geo);
    const el = result.floors["1"].elements[0];

    expect(el.x).toBeCloseTo(0.04, 10);
    expect(el.y).toBeCloseTo(0.02, 10);
    expect(el.width).toBeCloseTo(0.11, 10);
    expect(el.height).toBeCloseTo(0.10, 10);
  });
});
