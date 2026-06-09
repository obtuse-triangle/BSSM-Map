import { describe, expect, it } from "vitest";
import {
  campusFeatureCollectionSchema,
  campusFeatureSchema,
  campusFeaturePropertiesSchema,
  polygonGeometrySchema,
  controlPointSchema,
  georeferenceMetadataSchema,
  campusFeatureCategory,
  controlPointRole,
} from "../../src/schemas/campusGeojson";

import type {
  CampusFeatureCollection,
  CampusFeature,
  CampusFeatureProperties,
  PolygonGeometry,
  ControlPoint,
  GeoreferenceMetadata,
} from "../../src/schemas/campusGeojson";

describe("campusGeojson schemas", () => {
  describe("exports", () => {
    it("all schema exports are importable", () => {
      expect(campusFeatureCollectionSchema).toBeDefined();
      expect(campusFeatureSchema).toBeDefined();
      expect(campusFeaturePropertiesSchema).toBeDefined();
      expect(polygonGeometrySchema).toBeDefined();
      expect(controlPointSchema).toBeDefined();
      expect(georeferenceMetadataSchema).toBeDefined();
      expect(campusFeatureCategory).toBeDefined();
      expect(controlPointRole).toBeDefined();
    });

    it("all type exports are importable (type-check)", () => {
      // Type-level check only — assigns to never( ) to verify import resolution
      const _types: [
        CampusFeatureCollection,
        CampusFeature,
        CampusFeatureProperties,
        PolygonGeometry,
        ControlPoint,
        GeoreferenceMetadata,
      ] = null as never;
      expect(_types).toBeNull();
    });
  });

  describe("campusFeatureCategory", () => {
    it("accepts a valid category value", () => {
      const result = campusFeatureCategory.safeParse("room");
      expect(result.success).toBe(true);
    });

    it("rejects an invalid category value", () => {
      const result = campusFeatureCategory.safeParse("banana");
      expect(result.success).toBe(false);
    });
  });

  describe("controlPointRole", () => {
    it("accepts control and checkpoint", () => {
      expect(controlPointRole.safeParse("control").success).toBe(true);
      expect(controlPointRole.safeParse("checkpoint").success).toBe(true);
    });

    it("rejects anything else", () => {
      expect(controlPointRole.safeParse("gcp").success).toBe(false);
    });
  });

  describe("CampusFeatureCollection", () => {
    it("accepts a minimal valid FeatureCollection", () => {
      const fc: CampusFeatureCollection = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [0, 0],
                  [1, 0],
                  [1, 1],
                  [0, 1],
                  [0, 0],
                ],
              ],
            },
            properties: {
              name: "Room 101",
              name_ko: "101호",
              level: 1,
              level_id: "1",
              building_id: "main",
              category: "room",
              interactive: true,
              source: "cad",
            },
          },
        ],
        metadata: {
          coordinateSystem: "local",
          units: "source-normalized",
        },
      };
      const result = campusFeatureCollectionSchema.safeParse(fc);
      expect(result.success).toBe(true);
    });

    it("rejects missing properties.category", () => {
      const raw = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [0, 0],
                  [1, 0],
                  [1, 1],
                  [0, 1],
                  [0, 0],
                ],
              ],
            },
            properties: {
              name: "Room 101",
              name_ko: "101호",
              level: 1,
              level_id: "1",
              building_id: "main",
              // category is missing
              interactive: true,
              source: "cad",
            },
          },
        ],
        metadata: {
          coordinateSystem: "local",
          units: "source-normalized",
        },
      };
      const result = campusFeatureCollectionSchema.safeParse(raw);
      expect(result.success).toBe(false);
    });

    it("rejects unclosed polygon ring", () => {
      const raw = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [0, 0],
                  [1, 0],
                  [1, 1],
                  [0, 1],
                  // missing final [0,0] — ring is not closed
                ],
              ],
            },
            properties: {
              name: "Room 101",
              name_ko: "101호",
              level: 1,
              level_id: "1",
              building_id: "main",
              category: "room",
              interactive: true,
              source: "cad",
            },
          },
        ],
        metadata: {
          coordinateSystem: "local",
          units: "source-normalized",
        },
      };
      const result = campusFeatureCollectionSchema.safeParse(raw);
      expect(result.success).toBe(false);
    });

    it("rejects missing type: FeatureCollection", () => {
      const raw = {
        // type: "FeatureCollection" is missing
        features: [
          {
            type: "Feature",
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [0, 0],
                  [1, 0],
                  [1, 1],
                  [0, 1],
                  [0, 0],
                ],
              ],
            },
            properties: {
              name: "Room 101",
              name_ko: "101호",
              level: 1,
              level_id: "1",
              building_id: "main",
              category: "room",
              interactive: true,
              source: "cad",
            },
          },
        ],
        metadata: {
          coordinateSystem: "local",
          units: "source-normalized",
        },
      };
      const result = campusFeatureCollectionSchema.safeParse(raw);
      expect(result.success).toBe(false);
    });

    it("rejects null", () => {
      const result = campusFeatureCollectionSchema.safeParse(null);
      expect(result.success).toBe(false);
    });
  });

  describe("CampusFeature", () => {
    it("accepts a valid feature", () => {
      const feat: CampusFeature = {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [10, 20],
              [30, 20],
              [30, 40],
              [10, 40],
              [10, 20],
            ],
          ],
        },
        properties: {
          name: "Hallway A",
          name_ko: "복도 A",
          level: 2,
          level_id: "2",
          building_id: "science",
          category: "corridor",
          interactive: false,
          source: "survey",
        },
      };
      const result = campusFeatureSchema.safeParse(feat);
      expect(result.success).toBe(true);
    });

    it("rejects non-Polygon geometry", () => {
      const raw = {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [10, 20],
        },
        properties: {
          name: "Point",
          name_ko: "포인트",
          level: 1,
          level_id: "1",
          building_id: "main",
          category: "room",
          interactive: false,
          source: "cad",
        },
      };
      const result = campusFeatureSchema.safeParse(raw);
      expect(result.success).toBe(false);
    });
  });

  describe("polygonGeometry", () => {
    it("accepts a valid closed polygon", () => {
      const result = polygonGeometrySchema.safeParse({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [5, 0],
            [5, 5],
            [0, 5],
            [0, 0],
          ],
        ],
      });
      expect(result.success).toBe(true);
    });

    it("rejects unclosed polygon ring", () => {
      const result = polygonGeometrySchema.safeParse({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [5, 0],
            [5, 5],
            [0, 5],
            // [0, 0] missing — not closed
          ],
        ],
      });
      expect(result.success).toBe(false);
    });

    it("rejects a ring with fewer than 4 positions", () => {
      const result = polygonGeometrySchema.safeParse({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [0, 0],
          ],
        ],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("ControlPoint", () => {
    it("accepts a valid control point", () => {
      const cp: ControlPoint = {
        id: "cp01",
        label: "Main Gate",
        local: [12.5, 34.8],
        lngLat: [127.0, 37.5],
        role: "control",
      };
      const result = controlPointSchema.safeParse(cp);
      expect(result.success).toBe(true);
    });

    it("rejects an invalid role", () => {
      const raw = {
        id: "cp01",
        label: "Main Gate",
        local: [12.5, 34.8],
        lngLat: [127.0, 37.5],
        role: "invalid_role",
      };
      const result = controlPointSchema.safeParse(raw);
      expect(result.success).toBe(false);
    });
  });

  describe("GeoreferenceMetadata", () => {
    it("accepts valid georeference metadata", () => {
      const gm: GeoreferenceMetadata = {
        transformType: "affine",
        coefficients: [1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
        residuals: [
          { pointId: "cp01", dx: 0.01, dy: -0.02 },
        ],
        rms: 0.015,
        maxResidual: 0.02,
      };
      const result = georeferenceMetadataSchema.safeParse(gm);
      expect(result.success).toBe(true);
    });

    it("rejects negative RMS", () => {
      const raw = {
        transformType: "affine",
        coefficients: [],
        residuals: [],
        rms: -1,
        maxResidual: 0.5,
      };
      const result = georeferenceMetadataSchema.safeParse(raw);
      expect(result.success).toBe(false);
    });
  });
});
