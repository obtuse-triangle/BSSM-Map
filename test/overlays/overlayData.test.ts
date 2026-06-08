import { describe, it, expect } from "vitest";
import {
  campusWgs84FeatureCollectionSchema,
  campusWgs84FeatureSchema,
} from "../../src/schemas/campusWgs84Geojson";
import { campusFeatureCategory } from "../../src/schemas/campusGeojson";
import {
  filterFeaturesByLevel,
  getAvailableLevels,
  getFeatureLngLat,
  getFeatureBounds,
  DEFAULT_CATEGORY_STYLES,
} from "../../src/overlays/shared";
import type { CampusWgs84FeatureCollection } from "../../src/schemas/campusWgs84Geojson";
import type { CampusFeatureCategory } from "../../src/schemas/campusGeojson";

// ─── Test helpers ───────────────────────────────────────────────

function wgs84Feature(
  overrides?: Partial<
    CampusWgs84FeatureCollection["features"][number]
  >,
): CampusWgs84FeatureCollection["features"][number] {
  const defaults = {
    type: "Feature" as const,
    geometry: {
      type: "Polygon" as const,
      coordinates: [
        [
          [128.0, 35.0],
          [128.1, 35.0],
          [128.1, 35.1],
          [128.0, 35.1],
          [128.0, 35.0],
        ],
      ],
    },
    properties: {
      fid: 1,
      id: "1-4-7",
      name: "Test Room",
      name_ko: "테스트룸",
      level: 1,
      level_id: "1",
      building_id: "campus-main",
      category: "classroom" as const,
      interactive: true,
      source: "test",
    },
  };
  return { ...defaults, ...overrides } as CampusWgs84FeatureCollection["features"][number];
}

function wgs84Collection(
  features: CampusWgs84FeatureCollection["features"][number][],
): CampusWgs84FeatureCollection {
  return {
    type: "FeatureCollection",
    features,
    metadata: {
      coordinateSystem: "WGS84",
    },
  } as CampusWgs84FeatureCollection;
}

// ─── Tests ──────────────────────────────────────────────────────

describe("campusWgs84Geojson schema", () => {
  it("accepts valid WGS84 feature collection", () => {
    const data = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [128.0, 35.0],
                [128.1, 35.0],
                [128.1, 35.1],
                [128.0, 35.1],
                [128.0, 35.0],
              ],
            ],
          },
          properties: {
            fid: 1,
            id: "1-4-7",
            name: "정독실",
            name_ko: "정독실",
            level: 1,
            level_id: "1",
            building_id: "campus-main",
            category: "classroom",
            interactive: true,
            source: "학교배치도(창고위치).hwpx",
          },
        },
      ],
      metadata: {
        coordinateSystem: "WGS84",
      },
    };

    const result = campusWgs84FeatureCollectionSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("accepts WGS84 feature without optional fid and id", () => {
    const data = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [128.0, 35.0],
                [128.1, 35.0],
                [128.1, 35.1],
                [128.0, 35.1],
                [128.0, 35.0],
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
            interactive: false,
            source: "test",
          },
        },
      ],
      metadata: {
        coordinateSystem: "WGS84",
      },
    };

    const result = campusWgs84FeatureCollectionSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("rejects local-coordinate data (coordinateSystem must be WGS84)", () => {
    const data = {
      type: "FeatureCollection",
      features: [],
      metadata: {
        coordinateSystem: "local",
        units: "source-normalized",
      },
    };

    const result = campusWgs84FeatureCollectionSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      // Should mention coordinateSystem in the error path
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths.some((p) => p.includes("coordinateSystem"))).toBe(true);
    }
  });

  it("rejects invalid geometry (non-closed ring)", () => {
    const data = {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [128.0, 35.0],
            [128.1, 35.0],
            [128.1, 35.1],
            [128.0, 35.1],
            // Missing closing coordinate
          ],
        ],
      },
      properties: {
        name: "Bad Room",
        name_ko: "베드룸",
        level: 1,
        level_id: "1",
        building_id: "campus-main",
        category: "room",
        interactive: true,
        source: "test",
      },
    };

    const result = campusWgs84FeatureSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(
        messages.some((m) => m.toLowerCase().includes("closed")),
      ).toBe(true);
    }
  });
});

describe("filterFeaturesByLevel", () => {
  it("returns only features matching the given level_id", () => {
    const collection = wgs84Collection([
      wgs84Feature({
        properties: { ...wgs84Feature().properties, level_id: "1", name_ko: "A" },
      }),
      wgs84Feature({
        properties: { ...wgs84Feature().properties, level_id: "2", name_ko: "B" },
      }),
      wgs84Feature({
        properties: { ...wgs84Feature().properties, level_id: "1", name_ko: "C" },
      }),
    ]);

    const result = filterFeaturesByLevel(collection, "1");

    expect(result).toHaveLength(2);
    expect(result[0].properties.name_ko).toBe("A");
    expect(result[1].properties.name_ko).toBe("C");
  });

  it("returns empty array for non-existent level", () => {
    const collection = wgs84Collection([
      wgs84Feature({
        properties: { ...wgs84Feature().properties, level_id: "1" },
      }),
    ]);

    const result = filterFeaturesByLevel(collection, "99");

    expect(result).toHaveLength(0);
  });
});

describe("getAvailableLevels", () => {
  it("returns sorted unique level IDs", () => {
    const collection = wgs84Collection([
      wgs84Feature({
        properties: { ...wgs84Feature().properties, level_id: "3" },
      }),
      wgs84Feature({
        properties: { ...wgs84Feature().properties, level_id: "1" },
      }),
      wgs84Feature({
        properties: { ...wgs84Feature().properties, level_id: "2" },
      }),
      wgs84Feature({
        properties: { ...wgs84Feature().properties, level_id: "1" },
      }),
    ]);

    const result = getAvailableLevels(collection);

    expect(result).toEqual(["1", "2", "3"]);
  });

  it("returns empty array for empty collection", () => {
    const collection = wgs84Collection([]);
    expect(getAvailableLevels(collection)).toEqual([]);
  });
});

describe("getFeatureLngLat", () => {
  it("returns centroid of a rectangular polygon", () => {
    const feature = wgs84Feature({
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [128.0, 35.0],
            [128.1, 35.0],
            [128.1, 35.1],
            [128.0, 35.1],
            [128.0, 35.0],
          ],
        ],
      },
    });

    const centroid = getFeatureLngLat(feature);

    expect(centroid[0]).toBeCloseTo(128.05, 10);
    expect(centroid[1]).toBeCloseTo(35.05, 10);
  });

  it("handles a polygon with a single triangle (3 distinct vertices + close)", () => {
    const feature = wgs84Feature({
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [128.0, 35.0],
            [128.1, 35.0],
            [128.05, 35.1],
            [128.0, 35.0],
          ],
        ],
      },
    });

    const centroid = getFeatureLngLat(feature);

    expect(centroid[0]).toBeCloseTo((128.0 + 128.1 + 128.05) / 3, 10);
    expect(centroid[1]).toBeCloseTo((35.0 + 35.0 + 35.1) / 3, 10);
  });
});

describe("getFeatureBounds", () => {
  it("returns correct bounding box for multiple features", () => {
    const features = [
      wgs84Feature({
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [128.0, 35.0],
              [128.1, 35.0],
              [128.1, 35.1],
              [128.0, 35.1],
              [128.0, 35.0],
            ],
          ],
        },
      }),
      wgs84Feature({
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [128.05, 35.05],
              [128.2, 35.05],
              [128.2, 35.2],
              [128.05, 35.2],
              [128.05, 35.05],
            ],
          ],
        },
      }),
    ];

    const bounds = getFeatureBounds(features);

    expect(bounds.north).toBeCloseTo(35.2, 10);
    expect(bounds.south).toBeCloseTo(35.0, 10);
    expect(bounds.east).toBeCloseTo(128.2, 10);
    expect(bounds.west).toBeCloseTo(128.0, 10);
  });

  it("returns -Infinity/Infinity for empty features array", () => {
    const bounds = getFeatureBounds([]);

    expect(bounds.north).toBe(-Infinity);
    expect(bounds.south).toBe(Infinity);
    expect(bounds.east).toBe(-Infinity);
    expect(bounds.west).toBe(Infinity);
  });
});

describe("DEFAULT_CATEGORY_STYLES", () => {
  it("has entries for every CampusFeatureCategory", () => {
    // Collect all category values from the enum schema
    const allCategories: CampusFeatureCategory[] =
      campusFeatureCategory.options as unknown as CampusFeatureCategory[];

    for (const cat of allCategories) {
      expect(DEFAULT_CATEGORY_STYLES[cat]).toBeDefined();
      expect(typeof DEFAULT_CATEGORY_STYLES[cat].fillColor).toBe("string");
    }
  });

  it("each style has a valid fillColor", () => {
    for (const [cat, style] of Object.entries(DEFAULT_CATEGORY_STYLES)) {
      expect(style.fillColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe("campusWgs84 data export", () => {
  it("exports a non-empty feature collection", async () => {
    const { campusWgs84FeatureCollection } = await import(
      "../../src/data/campus-wgs84"
    );

    expect(campusWgs84FeatureCollection.type).toBe("FeatureCollection");
    expect(campusWgs84FeatureCollection.features.length).toBeGreaterThan(0);
  });
});
