import { beforeAll, describe, expect, it } from "vitest";
import { convertToGeoJson } from "../../scripts/build-campus-geojson.mjs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import {
  campusFeatureCollectionSchema,
  polygonGeometrySchema,
} from "../../src/schemas/campusGeojson";

const HWPX_PATH = resolve("org_data/학교배치도(창고위치).hwpx");

/**
 * Extract raw JSON from the HWPX file (with borderFillId).
 */
async function extractRawJson(): Promise<any> {
  const xml = execSync(
    "unzip -p -- " + JSON.stringify(HWPX_PATH) + " Contents/section0.xml",
    { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 }
  );

  // Use dynamic import since scripts are ESM and tests are transpiled by vitest
  const { extractTablesFromXml } = await import("../../scripts/extract-hwpx.mjs");
  return extractTablesFromXml(xml, "학교배치도(창고위치).hwpx");
}

describe("build-campus-geojson", () => {
  let rawData: any;
  let result: ReturnType<typeof convertToGeoJson>;

  beforeAll(async () => {
    rawData = await extractRawJson();
    result = convertToGeoJson(rawData);
  });

  // ─── Happy path ───────────────────────────────────────────────

  it("produces a valid CampusFeatureCollection", () => {
    const parseResult = campusFeatureCollectionSchema.safeParse(
      result.featureCollection
    );
    if (!parseResult.success) {
      console.error("Schema validation errors:", parseResult.error.issues);
    }
    expect(parseResult.success).toBe(true);
  });

  it("has at least 100 features", () => {
    expect(result.featureCollection.features.length).toBeGreaterThanOrEqual(100);
  });

  it("has features for all 4 levels", () => {
    const levelIds = new Set(
      result.featureCollection.features.map(
        (f: any) => f.properties.level_id
      )
    );
    expect(levelIds.has("1")).toBe(true);
    expect(levelIds.has("2")).toBe(true);
    expect(levelIds.has("3")).toBe(true);
    expect(levelIds.has("4")).toBe(true);
    expect(levelIds.size).toBe(4);
  });

  // ─── Geometry validation ──────────────────────────────────────

  it("all polygon rings are closed", () => {
    for (const feature of result.featureCollection.features) {
      const parseResult = polygonGeometrySchema.safeParse(feature.geometry);
      expect(parseResult.success).toBe(true);
    }
  });

  it("all coordinates are finite numbers in [0, 1] range", () => {
    for (const feature of result.featureCollection.features) {
      for (const ring of feature.geometry.coordinates) {
        for (const [x, y] of ring) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(1);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(1);
          expect(Number.isFinite(x)).toBe(true);
          expect(Number.isFinite(y)).toBe(true);
        }
      }
    }
  });

  // ─── Required properties ──────────────────────────────────────

  it('every feature has type "Feature"', () => {
    for (const feature of result.featureCollection.features) {
      expect(feature.type).toBe("Feature");
    }
  });

  it("every feature has an id", () => {
    for (const feature of result.featureCollection.features) {
      expect(feature).toHaveProperty("id");
      expect(typeof feature.id).toBe("string");
      expect(feature.id.length).toBeGreaterThan(0);
    }
  });

  it("every feature has geometry type Polygon", () => {
    for (const feature of result.featureCollection.features) {
      expect(feature.geometry.type).toBe("Polygon");
    }
  });

  it("every feature has all required properties", () => {
    for (const feature of result.featureCollection.features) {
      const p = feature.properties;
      expect(p).toHaveProperty("name");
      expect(p).toHaveProperty("name_ko");
      expect(p).toHaveProperty("level");
      expect(typeof p.level).toBe("number");
      expect(p).toHaveProperty("level_id");
      expect(p).toHaveProperty("building_id");
      expect(p).toHaveProperty("category");
      expect(p).toHaveProperty("interactive");
      expect(typeof p.interactive).toBe("boolean");
      expect(p).toHaveProperty("source");
    }
  });

  // ─── Metadata ─────────────────────────────────────────────────

  it("has correct metadata", () => {
    expect(result.featureCollection.metadata.coordinateSystem).toBe("local");
    expect(result.featureCollection.metadata.units).toBe("source-normalized");
  });

  // ─── Category correctness ─────────────────────────────────────

  it("has stair features (계단실)", () => {
    const stairs = result.featureCollection.features.filter(
      (f: any) => f.properties.category === "stair"
    );
    expect(stairs.length).toBeGreaterThanOrEqual(4);
    for (const s of stairs) {
      expect(s.properties.interactive).toBe(false);
    }
  });

  it("has elevator features (E.V)", () => {
    const elevators = result.featureCollection.features.filter(
      (f: any) => f.properties.category === "elevator"
    );
    expect(elevators.length).toBeGreaterThanOrEqual(2);
  });

  it("has restroom features (화장실)", () => {
    const restrooms = result.featureCollection.features.filter(
      (f: any) => f.properties.category === "restroom"
    );
    expect(restrooms.length).toBeGreaterThanOrEqual(1);
  });

  it("has structural features (thick border, no text)", () => {
    const structural = result.featureCollection.features.filter(
      (f: any) => f.properties.category === "structural"
    );
    expect(structural.length).toBeGreaterThanOrEqual(20);
    for (const s of structural) {
      expect(s.properties.interactive).toBe(false);
      expect(s.properties.name_ko).toBe("");
    }
  });

  it("has X-pattern (slash+backslash) cells classified as unknown", () => {
    const unknown = result.featureCollection.features.filter(
      (f: any) => f.properties.category === "unknown"
    );
    // 23 X-pattern cells exist in the data (slash=CENTER AND backSlash=CENTER)
    expect(unknown.length).toBeGreaterThanOrEqual(23);
    // X-marked areas are not interactive
    for (const u of unknown) {
      expect(u.properties.interactive).toBe(false);
    }
  });

  // ─── Empty thin-bordered cells are excluded ───────────────────

  it("does NOT include features with empty text from thin-bordered cells", () => {
    // structural features would have empty text from thick-border cells
    // Check that no feature has empty text and non-structural category
    const suspicious = result.featureCollection.features.filter(
      (f: any) =>
        f.properties.name_ko === "" &&
        f.properties.category !== "structural" &&
        f.properties.category !== "unknown"
    );
    expect(suspicious.length).toBe(0);
  });

  // ─── Feature IDs are stable ───────────────────────────────────

  it("feature IDs match the expected pattern", () => {
    for (const feature of result.featureCollection.features) {
      expect(feature.id).toMatch(/^\d+-\d+-\d+$/);
    }
  });

  it("feature IDs are stable (same run = same IDs)", () => {
    const result2 = convertToGeoJson(rawData);
    const ids1 = result.featureCollection.features.map((f: any) => f.id);
    const ids2 = result2.featureCollection.features.map((f: any) => f.id);
    expect(ids1).toEqual(ids2);
  });

  // ─── Source ───────────────────────────────────────────────────

  it("source is set correctly", () => {
    for (const feature of result.featureCollection.features) {
      expect(feature.properties.source).toBe("학교배치도(창고위치).hwpx");
    }
  });

  // ─── Building outlines ────────────────────────────────────────

  it("detects building outlines", () => {
    expect(result.buildingOutlines.length).toBeGreaterThanOrEqual(1);
    for (const outline of result.buildingOutlines) {
      expect(outline).toHaveProperty("building_id");
      expect(outline).toHaveProperty("level_id");
      expect(outline).toHaveProperty("vertices");
      expect(outline.vertices.length).toBeGreaterThanOrEqual(3);
      expect(outline).toHaveProperty("vertexLabels");
    }
  });

  // ─── Error handling ───────────────────────────────────────────

  it("handles empty tables gracefully", () => {
    const emptyInput = {
      source: "test",
      tables: [
        { index: 0, role: "legend", rowCount: 1, colCount: 1, cells: [] },
        {
          index: 1,
          role: "level",
          levelId: "1",
          rowCount: 2,
          colCount: 2,
          cells: [
            {
              rowIndex: 0,
              colIndex: 0,
              rowSpan: 1,
              colSpan: 1,
              text: "",
              width: 100,
              height: 100,
              borderFillId: 3,
            },
          ],
        },
      ],
    };
    const emptyResult = convertToGeoJson(emptyInput);
    // Empty thin-bordered cell → should be dropped
    expect(emptyResult.featureCollection.features.length).toBe(0);
  });

  it("handles malformed input (no tables) gracefully", () => {
    const badInput = { source: "test" };
    expect(() => convertToGeoJson(badInput)).not.toThrow();
    const result = convertToGeoJson(badInput);
    expect(result.featureCollection.features.length).toBe(0);
  });

  it("handles null/empty cells array gracefully", () => {
    const nullInput = {
      source: "test",
      tables: [
        {
          index: 1,
          role: "level",
          levelId: "1",
          rowCount: 0,
          colCount: 0,
          cells: [],
        },
      ],
    };
    expect(() => convertToGeoJson(nullInput)).not.toThrow();
  });
});

describe("build-campus-geojson CLI", () => {
  it("exits with error when --input is missing", () => {
    expect(() => {
      execSync("node scripts/build-campus-geojson.mjs", {
        encoding: "utf-8",
      });
    }).toThrow();
  });

  it("exits with error when input file does not exist", () => {
    expect(() => {
      execSync("node scripts/build-campus-geojson.mjs --input /nonexistent/file.json", {
        encoding: "utf-8",
      });
    }).toThrow();
  });
});
