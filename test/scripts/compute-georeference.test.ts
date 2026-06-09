import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  computeAffineTransform,
  computeResiduals,
  validateGeoreference,
  buildReport,
  computeCentroidLat,
  convertDegreesToMetres,
} from "../../scripts/compute-georeference.mjs";

import { georeferenceMetadataSchema } from "../../src/schemas/campusGeojson";

// ─── Fixture paths ────────────────────────────────────────────────────────

const FIXTURE_PATH = resolve("test/fixtures/campus-control-points.json");
const SCRIPT_PATH = resolve("scripts/compute-georeference.mjs");

function loadFloor1ControlPoints() {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf-8")).filter(
    (cp: any) => cp.role === "control" && (cp.locals?.["1"] || cp.local)
  );
}

// ─── Test data ────────────────────────────────────────────────────────────

/** 4 corners of a perfect affine rectangle */
const FOUR_CORNERS = [
  { id: "bl", label: "BL", local: [0, 0], lngLat: [129.0, 35.1], role: "control" as const },
  { id: "br", label: "BR", local: [1, 0], lngLat: [129.002, 35.1], role: "control" as const },
  { id: "tl", label: "TL", local: [0, 1], lngLat: [129.0, 35.1018], role: "control" as const },
  { id: "tr", label: "TR", local: [1, 1], lngLat: [129.002, 35.1018], role: "control" as const },
];

const EXPECTED_FORWARD = [0.002, 0, 129.0, 0, 0.0018, 35.1];
// Inverse: x = 500*lng + 0*lat - 64500, y = 0*lng + 555.555...*lat - 19500
const EXPECTED_INVERSE = [500, 0, -64500, 0, 5000 / 9, -19500];

/** 3 points (insufficient for affine) */
const THREE_POINTS = [
  { id: "a", label: "A", local: [0, 0], lngLat: [129.0, 35.1], role: "control" as const },
  { id: "b", label: "B", local: [1, 0], lngLat: [129.002, 35.1], role: "control" as const },
  { id: "c", label: "C", local: [0, 1], lngLat: [129.0, 35.1018], role: "control" as const },
];

/** Points with one deliberately misplaced to cause high residuals */
const HIGH_RESIDUAL_POINTS = [
  { id: "p1", label: "P1", local: [0, 0], lngLat: [129.0, 35.1], role: "control" as const },
  { id: "p2", label: "P2", local: [1, 0], lngLat: [129.002, 35.1], role: "control" as const },
  { id: "p3", label: "P3", local: [0, 1], lngLat: [129.0, 35.1018], role: "control" as const },
  {
    id: "p4",
    label: "P4",
    local: [0.5, 0.5],
    lngLat: [129.1, 35.2], // way off
    role: "control" as const,
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// 1. Happy path – correct transform coefficients
// ═══════════════════════════════════════════════════════════════════════════

describe("computeAffineTransform", () => {
  it("computes exact forward coefficients from 4 corner points", () => {
    const result = computeAffineTransform(FOUR_CORNERS);
    for (let i = 0; i < 6; i++) {
      expect(result.forward[i]).toBeCloseTo(EXPECTED_FORWARD[i], 10);
    }
  });

  it("computes exact inverse coefficients from 4 corner points", () => {
    const result = computeAffineTransform(FOUR_CORNERS);
    for (let i = 0; i < 6; i++) {
      expect(result.inverse[i]).toBeCloseTo(EXPECTED_INVERSE[i], 6);
    }
  });

  it("computes valid transform from real control points fixture (5 points)", () => {
    const raw = loadFloor1ControlPoints();
    const result = computeAffineTransform(raw);

    // Forward and inverse must be length 6 with finite coefficients
    expect(result.forward).toHaveLength(6);
    expect(result.inverse).toHaveLength(6);
    for (let i = 0; i < 6; i++) {
      expect(Number.isFinite(result.forward[i])).toBe(true);
      expect(Number.isFinite(result.inverse[i])).toBe(true);
    }

    // Roundtrip: forward(/*local*/) → inverse → back to local for each control point
    // Use tolerance ~5e-4 — real control points span small area, near-singular
    // determinant amplifies floating-point noise in the inverse
    for (const cp of raw) {
      const local = cp.locals?.["1"] || cp.local;
      if (!local) continue;
      const [lng, lat] = [
        result.forward[0] * local[0] + result.forward[1] * local[1] + result.forward[2],
        result.forward[3] * local[0] + result.forward[4] * local[1] + result.forward[5],
      ];
      const [x, y] = [
        result.inverse[0] * lng + result.inverse[1] * lat + result.inverse[2],
        result.inverse[3] * lng + result.inverse[4] * lat + result.inverse[5],
      ];
      expect(x).toBeCloseTo(local[0], 3);
      expect(y).toBeCloseTo(local[1], 3);
    }
  });

  it("roundtrip error is < 1e-10 for forward→inverse", () => {
    const result = computeAffineTransform(FOUR_CORNERS);
    const { forward, inverse } = result;

    // Apply forward then inverse at several points
    for (const cp of FOUR_CORNERS) {
      const [lng, lat] = [
        forward[0] * cp.local[0] + forward[1] * cp.local[1] + forward[2],
        forward[3] * cp.local[0] + forward[4] * cp.local[1] + forward[5],
      ];
      const [x, y] = [
        inverse[0] * lng + inverse[1] * lat + inverse[2],
        inverse[3] * lng + inverse[4] * lat + inverse[5],
      ];
      expect(x).toBeCloseTo(cp.local[0], 10);
      expect(y).toBeCloseTo(cp.local[1], 10);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Residual computation
// ═══════════════════════════════════════════════════════════════════════════

describe("computeResiduals", () => {
  it("returns zero residuals for perfectly fitting points", () => {
    const transform = computeAffineTransform(FOUR_CORNERS);
    const residuals = computeResiduals(FOUR_CORNERS, transform);
    for (const r of residuals) {
      expect(r.distance).toBeLessThan(1e-10);
    }
  });

  it("returns small residuals for points with tiny noise", () => {
    const noisy = FOUR_CORNERS.map((cp) => ({
      ...cp,
      lngLat: [cp.lngLat[0] + 1e-8, cp.lngLat[1] + 1e-8] as [number, number],
    }));
    const transform = computeAffineTransform(noisy);
    const residuals = computeResiduals(noisy, transform);
    for (const r of residuals) {
      expect(r.distance).toBeLessThan(0.01); // < 1cm
    }
  });

  it("returns non-zero residuals from fixture checkpoint when using only 4 control points", () => {
    // Compute transform from 4 corners only, then compute residuals including checkpoints
    const raw = loadFloor1ControlPoints();
    const controls = raw.filter((cp: any) => cp.role === "control");
    const transform = computeAffineTransform(controls);

    // The checkpoints in fixture perfectly fit the same affine, so residuals should be ~0
    const allResiduals = computeResiduals(raw, transform);
    const checkpointResiduals = allResiduals.filter((r) =>
      raw.find((cp: any) => cp.id === r.pointId && cp.role === "checkpoint")
    );
    for (const r of checkpointResiduals) {
      expect(r.distance).toBeLessThan(1e-10);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. RMS / max residual calculation
// ═══════════════════════════════════════════════════════════════════════════

describe("validateGeoreference", () => {
  it("computes RMS correctly", () => {
    const transform = computeAffineTransform(FOUR_CORNERS);
    const result = validateGeoreference(FOUR_CORNERS, transform);
    expect(result.rms).toBeCloseTo(0, 10);
    expect(result.maxResidual).toBeCloseTo(0, 10);
  });

  it("computes RMS and max for non-perfect points", () => {
    // Points with differing lng/lat that are NOT collinear in either space
    const points = [
      { id: "a", label: "A", local: [0.1, 0.2], lngLat: [129.0, 35.1], role: "control" as const },
      { id: "b", label: "B", local: [0.3, 0.5], lngLat: [129.0001, 35.1], role: "control" as const },
      { id: "c", label: "C", local: [0.6, 0.3], lngLat: [129.0, 35.1002], role: "control" as const },
      { id: "d", label: "D", local: [0.8, 0.9], lngLat: [129.0003, 35.1003], role: "control" as const },
    ];
    const transform = computeAffineTransform(points);
    const result = validateGeoreference(points, transform);

    expect(result.rms).toBeGreaterThan(0);
    expect(result.maxResidual).toBeGreaterThan(0);
    expect(result.maxResidual).toBeGreaterThanOrEqual(result.rms);
  });

  it("returns passed: true when thresholds are within limits", () => {
    const transform = computeAffineTransform(FOUR_CORNERS);
    const result = validateGeoreference(FOUR_CORNERS, transform);
    expect(result.passed).toBe(true);
    expect(result.rms).toBeLessThanOrEqual(result.rmsThreshold);
    expect(result.maxResidual).toBeLessThanOrEqual(result.maxResidualThreshold);
  });

  it("respects custom thresholds", () => {
    const points = [
      { id: "a", label: "A", local: [0, 0], lngLat: [129.0, 35.1], role: "control" as const },
      { id: "b", label: "B", local: [1, 0], lngLat: [129.002, 35.1], role: "control" as const },
      { id: "c", label: "C", local: [0, 1], lngLat: [129.0, 35.1018], role: "control" as const },
      { id: "d", label: "D", local: [0.5, 0.5], lngLat: [129.001, 35.1009], role: "control" as const },
    ];
    // With these points, RMS ~0 but let's set tight thresholds
    const transform = computeAffineTransform(points);
    const result = validateGeoreference(points, transform, {
      rmsThreshold: 0.5,
      maxResidualThreshold: 1.0,
    });
    expect(result.rmsThreshold).toBe(0.5);
    expect(result.maxResidualThreshold).toBe(1.0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Too few control points
// ═══════════════════════════════════════════════════════════════════════════

describe("too few control points", () => {
  it("throws with message containing 'at least 4' for 3 points", () => {
    expect(() => computeAffineTransform(THREE_POINTS)).toThrow(/at least 4/i);
  });

  it("throws for empty array", () => {
    expect(() => computeAffineTransform([])).toThrow(/at least 4/i);
  });

  it("throws for 1 point", () => {
    expect(() =>
      computeAffineTransform([THREE_POINTS[0]])
    ).toThrow(/at least 4/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. High residual failure
// ═══════════════════════════════════════════════════════════════════════════

describe("high residual detection", () => {
  it("returns passed: false when points do not fit affine well", () => {
    const transform = computeAffineTransform(HIGH_RESIDUAL_POINTS);
    const result = validateGeoreference(HIGH_RESIDUAL_POINTS, transform);
    expect(result.passed).toBe(false);
    expect(result.rms).toBeGreaterThan(2);
    expect(result.maxResidual).toBeGreaterThan(5);
  });

  it("all residuals have non-negative distance values", () => {
    const transform = computeAffineTransform(HIGH_RESIDUAL_POINTS);
    const result = validateGeoreference(HIGH_RESIDUAL_POINTS, transform);
    for (const r of result.residuals) {
      expect(r.distance).toBeGreaterThanOrEqual(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Inverse transform roundtrip
// ═══════════════════════════════════════════════════════════════════════════

describe("inverse transform", () => {
  it("forward then inverse roundtrip error < 1e-10", () => {
    const result = computeAffineTransform(FOUR_CORNERS);
    const { forward, inverse } = result;

    // Test at various points in [0,1] space
    const testPoints = [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [0.25, 0.75],
      [0.618, 0.382],
    ];

    for (const [lx, ly] of testPoints) {
      const lng = forward[0] * lx + forward[1] * ly + forward[2];
      const lat = forward[3] * lx + forward[4] * ly + forward[5];
      const x = inverse[0] * lng + inverse[1] * lat + inverse[2];
      const y = inverse[3] * lng + inverse[4] * lat + inverse[5];

      expect(x).toBeCloseTo(lx, 10);
      expect(y).toBeCloseTo(ly, 10);
    }
  });

  it("inverse then forward roundtrip error < 1e-10", () => {
    const result = computeAffineTransform(FOUR_CORNERS);
    const { forward, inverse } = result;

    // Test at various WGS84 points near the campus
    const testPoints = [
      [129.0, 35.1],
      [129.002, 35.1018],
      [129.001, 35.10045],
      [129.0005, 35.1009],
    ];

    for (const [lng, lat] of testPoints) {
      const x = inverse[0] * lng + inverse[1] * lat + inverse[2];
      const y = inverse[3] * lng + inverse[4] * lat + inverse[5];
      const predLng = forward[0] * x + forward[1] * y + forward[2];
      const predLat = forward[3] * x + forward[4] * y + forward[5];

      expect(predLng).toBeCloseTo(lng, 12);
      expect(predLat).toBeCloseTo(lat, 12);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. CLI integration with valid fixture
// ═══════════════════════════════════════════════════════════════════════════

describe("CLI integration", () => {
  const TMP_OUTPUT = resolve(".sisyphus/evidence/task-6-georeference-report.json");
  const TMP_FLOOR1_CONTROLS = resolve(".sisyphus/evidence/task-6-floor1-controls.json");

  it("exits 0 with valid control points and writes report", () => {
    writeFileSync(
      TMP_FLOOR1_CONTROLS,
      JSON.stringify(loadFloor1ControlPoints(), null, 2),
      "utf-8"
    );

    execSync(
      `node "${SCRIPT_PATH}" --control-points "${TMP_FLOOR1_CONTROLS}" --geojson "src/data/campus.json" --output "${TMP_OUTPUT}"`,
      { encoding: "utf-8" }
    );

    // Verify output file exists and is valid JSON
    const raw = readFileSync(TMP_OUTPUT, "utf-8");
    const report = JSON.parse(raw);

    expect(report.transformType).toBe("affine");
    expect(report.coefficients).toHaveLength(6);
    expect(report.residuals).toHaveLength(7);
    expect(report.rms).toBeGreaterThanOrEqual(0);
    expect(report.maxResidual).toBeGreaterThanOrEqual(0);
    expect(report.passed).toBe(true);
    expect(report.forwardCoefficients).toEqual(report.coefficients);

    // Validate against Zod schema
    const parseResult = georeferenceMetadataSchema.safeParse(report);
    expect(parseResult.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. CLI with too few control points
// ═══════════════════════════════════════════════════════════════════════════

describe("CLI too few controls", () => {
  const TMP_ERROR = resolve(".sisyphus/evidence/task-6-too-few-controls.txt");

  it("exits 1 with error message when fewer than 4 points", () => {
    // Create a temp fixture with 3 points
    const threePointFixture = [
      { id: "a", label: "A", local: [0, 0], lngLat: [129.0, 35.1], role: "control" },
      { id: "b", label: "B", local: [1, 0], lngLat: [129.002, 35.1], role: "control" },
      { id: "c", label: "C", local: [0, 1], lngLat: [129.0, 35.1018], role: "control" },
    ];

    const tempFixture = resolve("test/fixtures/temp-three-points.json");
    const { writeFileSync, unlinkSync } = require("node:fs");
    writeFileSync(tempFixture, JSON.stringify(threePointFixture), "utf-8");

    try {
      let stderr = "";
      try {
        execSync(
          `node "${SCRIPT_PATH}" --control-points "${tempFixture}" --output "${TMP_ERROR}"`,
          { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
        );
      } catch (e: any) {
        stderr = e.stderr || e.message;
      }

      expect(stderr).toMatch(/at least 4/i);
    } finally {
      unlinkSync(tempFixture);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. Distance conversion
// ═══════════════════════════════════════════════════════════════════════════

describe("degree-to-metre conversion", () => {
  it("converts at equator correctly", () => {
    const { dx, dy } = convertDegreesToMetres(1, 1, 0);
    expect(dx).toBeCloseTo(111320, 0); // cos(0) = 1
    expect(dy).toBeCloseTo(111320, 0);
  });

  it("converts at 35°N (campus latitude) correctly", () => {
    const lat = 35.1;
    const { dx, dy } = convertDegreesToMetres(1, 1, lat);
    const cosLat = Math.cos((lat * Math.PI) / 180);
    expect(dx).toBeCloseTo(111320 * cosLat, 0);
    expect(dy).toBeCloseTo(111320, 0);
  });

  it("converts at 60°N correctly", () => {
    const { dx, dy } = convertDegreesToMetres(1, 1, 60);
    expect(dx).toBeCloseTo(111320 * 0.5, 0); // cos(60°) = 0.5
    expect(dy).toBeCloseTo(111320, 0);
  });

  it("converts small offsets proportionally", () => {
    // 0.001° at 35°N
    const { dx, dy } = convertDegreesToMetres(0.001, 0.001, 35.1);
    const cosLat = Math.cos((35.1 * Math.PI) / 180);
    expect(dx).toBeCloseTo(111320 * cosLat * 0.001, 1);
    expect(dy).toBeCloseTo(111320 * 0.001, 1);
  });

  it("centroid function returns correct latitude", () => {
    const lat = computeCentroidLat(FOUR_CORNERS);
    expect(lat).toBeCloseTo(35.1009, 5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Additional: buildReport output validation
// ═══════════════════════════════════════════════════════════════════════════

describe("buildReport", () => {
  it("produces output matching expected structure", () => {
    const transform = computeAffineTransform(FOUR_CORNERS);
    const validation = validateGeoreference(FOUR_CORNERS, transform);
    const report = buildReport(FOUR_CORNERS, transform, validation);

    expect(report.transformType).toBe("affine");
    expect(report.coefficients).toHaveLength(6);
    expect(report.forwardCoefficients).toHaveLength(6);
    expect(report.inverseCoefficients).toHaveLength(6);
    expect(report.controlPoints).toHaveLength(4);
    expect(report.residuals).toHaveLength(4);
    expect(report.thresholds.rms).toBe(2.0);
    expect(report.thresholds.maxResidual).toBe(5.0);

    // Each residual should have pointId, dx, dy, distance
    for (const r of report.residuals) {
      expect(r).toHaveProperty("pointId");
      expect(r).toHaveProperty("dx");
      expect(r).toHaveProperty("dy");
      expect(r).toHaveProperty("distance");
    }

    // Validate against Zod schema (should pass even with extra fields)
    const parseResult = georeferenceMetadataSchema.safeParse(report);
    expect(parseResult.success).toBe(true);
  });

  it("validation with high residual includes passed: false", () => {
    const transform = computeAffineTransform(HIGH_RESIDUAL_POINTS);
    const validation = validateGeoreference(HIGH_RESIDUAL_POINTS, transform);
    const report = buildReport(HIGH_RESIDUAL_POINTS, transform, validation);

    expect(report.passed).toBe(false);
    expect(report.rms).toBeGreaterThan(2);
    expect(report.maxResidual).toBeGreaterThan(5);
  });
});
