import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

// ─── Paths ────────────────────────────────────────────────────────────────

const SCRIPT_PATH = resolve("scripts/export-wgs84-geojson.mjs");
const FIXTURE_PATH = resolve("test/fixtures/campus-control-points.json");
const EVIDENCE_DIR = resolve(".sisyphus/evidence");
const TMP_DIR = resolve("test/fixtures/tmp-export-test");

// ─── Test fixtures ────────────────────────────────────────────────────────

const MINIMAL_LOCAL_GEOJSON = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "test-feature-1",
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
        name: "Test Room 1",
        name_ko: "테스트룸1",
        level: 1,
        level_id: "1",
        building_id: "campus-main",
        category: "room" as const,
        interactive: true,
        source: "test",
      },
    },
    {
      type: "Feature",
      id: "test-feature-2",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0.25, 0.25],
            [0.75, 0.25],
            [0.75, 0.75],
            [0.25, 0.75],
            [0.25, 0.25],
          ],
        ],
      },
      properties: {
        name: "Test Room 2",
        name_ko: "테스트룸2",
        level: 2,
        level_id: "2",
        building_id: "campus-main",
        category: "classroom" as const,
        interactive: true,
        source: "test",
      },
    },
  ],
  metadata: {
    coordinateSystem: "local",
    units: "source-normalized" as const,
  },
};

const CONTROL_POINTS_FIXTURE = [
  {
    id: "bl",
    label: "BL",
    locals: { "1": [0, 0], "2": [0, 0] },
    lngLat: [129.0, 35.1],
    role: "control",
  },
  {
    id: "br",
    label: "BR",
    locals: { "1": [1, 0], "2": [1, 0] },
    lngLat: [129.002, 35.1],
    role: "control",
  },
  {
    id: "tl",
    label: "TL",
    locals: { "1": [0, 1], "2": [0, 1] },
    lngLat: [129.0, 35.1018],
    role: "control",
  },
  {
    id: "tr",
    label: "TR",
    locals: { "1": [1, 1], "2": [1, 1] },
    lngLat: [129.002, 35.1018],
    role: "control",
  },
  {
    id: "checkpoint-center",
    label: "Center",
    locals: { "1": [0.5, 0.5], "2": [0.5, 0.5] },
    lngLat: [129.001, 35.1009],
    role: "checkpoint",
  },
];

const THREE_POINTS = [
  { id: "a", label: "A", local: [0, 0], lngLat: [129.0, 35.1], role: "control" },
  { id: "b", label: "B", local: [1, 0], lngLat: [129.002, 35.1], role: "control" },
  { id: "c", label: "C", local: [0, 1], lngLat: [129.0, 35.1018], role: "control" },
];

// ─── Expected transform coefficients ──────────────────────────────────────

const EXPECTED_FORWARD = [0.002, 0, 129.0, 0, 0.0018, 35.1];

// ─── Helpers ──────────────────────────────────────────────────────────────

function tmpPath(name: string): string {
  return resolve(TMP_DIR, name);
}

function writeFixture(path: string, data: unknown): string {
  const fullPath = tmpPath(path);
  writeFileSync(fullPath, JSON.stringify(data), "utf-8");
  return fullPath;
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe("export-wgs84-geojson", () => {
  beforeAll(() => {
    if (!existsSync(TMP_DIR)) {
      mkdirSync(TMP_DIR, { recursive: true });
    }
  });

  afterAll(() => {
    // Clean up temp files
    for (const f of ["input.json", "ctl.json", "three.json", "output.json"]) {
      const p = tmpPath(f);
      if (existsSync(p)) unlinkSync(p);
    }
    if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true });
  });

  // ─── Happy path ────────────────────────────────────────────────

  it("transforms coordinates from local to WGS84", () => {
    const inputPath = writeFixture("input.json", MINIMAL_LOCAL_GEOJSON);
    const ctlPath = writeFixture("ctl.json", CONTROL_POINTS_FIXTURE);
    const outputPath = tmpPath("output.json");

    execSync(
      `node "${SCRIPT_PATH}" --input "${inputPath}" --control-points "${ctlPath}" --output "${outputPath}"`,
      { encoding: "utf-8" }
    );

    expect(existsSync(outputPath)).toBe(true);

    const raw = readFileSync(outputPath, "utf-8");
    const result = JSON.parse(raw);

    // Verify coordinates are transformed (not equal to input)
    const f1Coords = result.features[0].geometry.coordinates[0];
    const f1Input = MINIMAL_LOCAL_GEOJSON.features[0].geometry.coordinates[0];

    for (let i = 0; i < f1Coords.length; i++) {
      expect(f1Coords[i][0]).not.toBeCloseTo(f1Input[i][0], 10);
      expect(f1Coords[i][1]).not.toBeCloseTo(f1Input[i][1], 10);
    }
  });

  it("output metadata indicates WGS84", () => {
    const inputPath = writeFixture("input.json", MINIMAL_LOCAL_GEOJSON);
    const ctlPath = writeFixture("ctl.json", CONTROL_POINTS_FIXTURE);
    const outputPath = tmpPath("output.json");

    execSync(
      `node "${SCRIPT_PATH}" --input "${inputPath}" --control-points "${ctlPath}" --output "${outputPath}"`,
      { encoding: "utf-8" }
    );

    const raw = readFileSync(outputPath, "utf-8");
    const result = JSON.parse(raw);

    expect(result.metadata.coordinateSystem).toBe("WGS84");
    expect(result.metadata.units).toBe("degrees");
  });

  it("produces correct transformed coordinates", () => {
    const inputPath = writeFixture("input.json", MINIMAL_LOCAL_GEOJSON);
    const ctlPath = writeFixture("ctl.json", CONTROL_POINTS_FIXTURE);
    const outputPath = tmpPath("output.json");

    execSync(
      `node "${SCRIPT_PATH}" --input "${inputPath}" --control-points "${ctlPath}" --output "${outputPath}"`,
      { encoding: "utf-8" }
    );

    const raw = readFileSync(outputPath, "utf-8");
    const result = JSON.parse(raw);

    // [0,0] → [129.0, 35.1]
    expect(result.features[0].geometry.coordinates[0][0][0]).toBeCloseTo(129.0, 10);
    expect(result.features[0].geometry.coordinates[0][0][1]).toBeCloseTo(35.1, 10);

    // [1,0] → [129.002, 35.1]
    expect(result.features[0].geometry.coordinates[0][1][0]).toBeCloseTo(129.002, 10);
    expect(result.features[0].geometry.coordinates[0][1][1]).toBeCloseTo(35.1, 10);

    // [1,1] → [129.002, 35.1018]
    expect(result.features[0].geometry.coordinates[0][2][0]).toBeCloseTo(129.002, 10);
    expect(result.features[0].geometry.coordinates[0][2][1]).toBeCloseTo(35.1018, 10);

    // [0,1] → [129.0, 35.1018]
    expect(result.features[0].geometry.coordinates[0][3][0]).toBeCloseTo(129.0, 10);
    expect(result.features[0].geometry.coordinates[0][3][1]).toBeCloseTo(35.1018, 10);

    // Closure: last coord = first coord
    expect(result.features[0].geometry.coordinates[0][4][0]).toBeCloseTo(129.0, 10);
    expect(result.features[0].geometry.coordinates[0][4][1]).toBeCloseTo(35.1, 10);
  });

  it("all rings remain closed after transform", () => {
    const inputPath = writeFixture("input.json", MINIMAL_LOCAL_GEOJSON);
    const ctlPath = writeFixture("ctl.json", CONTROL_POINTS_FIXTURE);
    const outputPath = tmpPath("output.json");

    execSync(
      `node "${SCRIPT_PATH}" --input "${inputPath}" --control-points "${ctlPath}" --output "${outputPath}"`,
      { encoding: "utf-8" }
    );

    const raw = readFileSync(outputPath, "utf-8");
    const result = JSON.parse(raw);

    for (const feature of result.features) {
      for (const ring of feature.geometry.coordinates) {
        const first = ring[0];
        const last = ring[ring.length - 1];
        expect(first[0]).toBe(last[0]);
        expect(first[1]).toBe(last[1]);
      }
    }
  });

  it("preserves feature properties unchanged", () => {
    const inputPath = writeFixture("input.json", MINIMAL_LOCAL_GEOJSON);
    const ctlPath = writeFixture("ctl.json", CONTROL_POINTS_FIXTURE);
    const outputPath = tmpPath("output.json");

    execSync(
      `node "${SCRIPT_PATH}" --input "${inputPath}" --control-points "${ctlPath}" --output "${outputPath}"`,
      { encoding: "utf-8" }
    );

    const raw = readFileSync(outputPath, "utf-8");
    const result = JSON.parse(raw);

    for (let i = 0; i < result.features.length; i++) {
      const expected = MINIMAL_LOCAL_GEOJSON.features[i];
      const actual = result.features[i];
      expect(actual.properties.name).toBe(expected.properties.name);
      expect(actual.properties.name_ko).toBe(expected.properties.name_ko);
      expect(actual.properties.level).toBe(expected.properties.level);
      expect(actual.properties.category).toBe(expected.properties.category);
    }
  });

  it("output has valid FeatureCollection structure", () => {
    const inputPath = writeFixture("input.json", MINIMAL_LOCAL_GEOJSON);
    const ctlPath = writeFixture("ctl.json", CONTROL_POINTS_FIXTURE);
    const outputPath = tmpPath("output.json");

    execSync(
      `node "${SCRIPT_PATH}" --input "${inputPath}" --control-points "${ctlPath}" --output "${outputPath}"`,
      { encoding: "utf-8" }
    );

    const raw = readFileSync(outputPath, "utf-8");
    const result = JSON.parse(raw);

    expect(result.type).toBe("FeatureCollection");
    expect(Array.isArray(result.features)).toBe(true);
    expect(result.features.length).toBe(2);
    expect(result.metadata).toBeDefined();
    expect(result.metadata.coordinateSystem).toBe("WGS84");
    expect(result.metadata.units).toBe("degrees");

    // Validate each feature has the required fields
    for (const feature of result.features) {
      expect(feature.type).toBe("Feature");
      expect(feature.geometry.type).toBe("Polygon");
      expect(Array.isArray(feature.geometry.coordinates)).toBe(true);
      expect(feature.geometry.coordinates[0].length).toBeGreaterThanOrEqual(4);
      expect(feature.properties).toBeDefined();
      expect(typeof feature.properties.name).toBe("string");
      expect(typeof feature.properties.level).toBe("number");
    }
  });

  it("excludes checkpoint-only control points from transform computation", () => {
    // Control points with only checkpoints (no controls) should fail
    const noControls = CONTROL_POINTS_FIXTURE.filter((cp) => cp.role !== "control");
    const inputPath = writeFixture("input.json", MINIMAL_LOCAL_GEOJSON);
    const ctlPath = writeFixture("ctl.json", noControls);
    const outputPath = tmpPath("output.json");

    let stderr = "";
    try {
      execSync(
        `node "${SCRIPT_PATH}" --input "${inputPath}" --control-points "${ctlPath}" --output "${outputPath}"`,
        { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
      );
    } catch (e: any) {
      stderr = e.stderr || e.message;
    }

    expect(stderr).toMatch(/at least 4.*control/i);
  });

  // ─── Error handling ────────────────────────────────────────────

  it("exits with error when control points file is missing", () => {
    const inputPath = writeFixture("input.json", MINIMAL_LOCAL_GEOJSON);
    const missingCtl = tmpPath("nonexistent.json");
    const outputPath = tmpPath("output.json");

    let stderr = "";
    try {
      execSync(
        `node "${SCRIPT_PATH}" --input "${inputPath}" --control-points "${missingCtl}" --output "${outputPath}"`,
        { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
      );
    } catch (e: any) {
      stderr = e.stderr || e.message;
    }

    expect(stderr).toMatch(/not found/i);
  });

  it("exits with error when fewer than 4 control points", () => {
    const inputPath = writeFixture("input.json", MINIMAL_LOCAL_GEOJSON);
    const threeCtl = writeFixture("three.json", THREE_POINTS);
    const outputPath = tmpPath("output.json");

    let stderr = "";
    try {
      execSync(
        `node "${SCRIPT_PATH}" --input "${inputPath}" --control-points "${threeCtl}" --output "${outputPath}"`,
        { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
      );
    } catch (e: any) {
      stderr = e.stderr || e.message;
    }

    expect(stderr).toMatch(/at least 4/i);
  });

  it("exits with error when input file is missing", () => {
    const missingInput = tmpPath("nonexistent.json");
    const ctlPath = writeFixture("ctl.json", CONTROL_POINTS_FIXTURE);
    const outputPath = tmpPath("output.json");

    let stderr = "";
    try {
      execSync(
        `node "${SCRIPT_PATH}" --input "${missingInput}" --control-points "${ctlPath}" --output "${outputPath}"`,
        { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
      );
    } catch (e: any) {
      stderr = e.stderr || e.message;
    }

    expect(stderr).toMatch(/not found/i);
  });

  it("exits with error when input is not a FeatureCollection", () => {
    const invalidInput = {
      type: "NotFeatureCollection",
      data: [],
    };
    const inputPath = writeFixture("input.json", invalidInput);
    const ctlPath = writeFixture("ctl.json", CONTROL_POINTS_FIXTURE);
    const outputPath = tmpPath("output.json");

    let stderr = "";
    try {
      execSync(
        `node "${SCRIPT_PATH}" --input "${inputPath}" --control-points "${ctlPath}" --output "${outputPath}"`,
        { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
      );
    } catch (e: any) {
      stderr = e.stderr || e.message;
    }

    expect(stderr).toMatch(/FeatureCollection/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// WGS84 output validation with real control points
// ═══════════════════════════════════════════════════════════════════════════

describe("WGS84 export with real data", () => {
  const EVIDENCE_PATH = resolve(EVIDENCE_DIR, "task-7-wgs84-export.geojson");

  beforeAll(() => {
    if (!existsSync(EVIDENCE_DIR)) {
      mkdirSync(EVIDENCE_DIR, { recursive: true });
    }
  });

  it("transforms campus.json from local to WGS84", () => {
    const campusInput = resolve("src/data/campus.json");

    execSync(
      `node "${SCRIPT_PATH}" --input "${campusInput}" --control-points "${FIXTURE_PATH}" --output "${EVIDENCE_PATH}"`,
      { encoding: "utf-8" }
    );

    expect(existsSync(EVIDENCE_PATH)).toBe(true);

    const raw = readFileSync(EVIDENCE_PATH, "utf-8");
    const result = JSON.parse(raw);

    // Basic structure checks
    expect(result.type).toBe("FeatureCollection");
    expect(result.features).toBeDefined();
    expect(result.features.length).toBeGreaterThan(0);
    expect(result.metadata.coordinateSystem).toBe("WGS84");
    expect(result.metadata.units).toBe("degrees");

    // Verify coordinates are in reasonable WGS84 range for South Korea
    for (const feature of result.features) {
      for (const ring of feature.geometry.coordinates) {
        for (const [lng, lat] of ring) {
          expect(lng).toBeGreaterThan(128);
          expect(lng).toBeLessThan(130);
          expect(lat).toBeGreaterThan(35);
          expect(lat).toBeLessThan(36);
        }
      }
    }

    // All rings closed
    for (const feature of result.features) {
      for (const ring of feature.geometry.coordinates) {
        const first = ring[0];
        const last = ring[ring.length - 1];
        expect(first[0]).toBe(last[0]);
        expect(first[1]).toBe(last[1]);
      }
    }

    // Preserve buildingOutlines if present in input
    expect(result.buildingOutlines).toBeDefined();
  });
});
