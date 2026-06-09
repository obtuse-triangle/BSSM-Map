import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  computeFeatureExtent,
  resolveFloorAnchors,
} from "../../scripts/compute-floor-anchors.mjs";

// ─── Fixture paths ────────────────────────────────────────────────────────

const CAMPUS_PATH = resolve("src/data/campus.json");
const CONTROL_POINTS_PATH = resolve("test/fixtures/campus-control-points.json");

// ─── Load real campus data ────────────────────────────────────────────────

function loadCampus() {
  return JSON.parse(readFileSync(CAMPUS_PATH, "utf-8"));
}

function loadControlPoints() {
  return JSON.parse(readFileSync(CONTROL_POINTS_PATH, "utf-8"));
}

function getFloorFeatures(campus: any, level: number) {
  return campus.features.filter(
    (f: any) => f.properties.level === level
  );
}

function getStructuralFeatures(campus: any, level: number) {
  return campus.features.filter(
    (f: any) =>
      f.properties.level === level && f.properties.category === "structural"
  );
}

// ─── Expected extents (pre-computed from data) ────────────────────────────

const EXPECTED_EXTENTS: Record<string, { minX: number; minY: number; maxX: number; maxY: number }> = {
  "1": { minX: 0.004025, minY: 0.016002, maxX: 1.0, maxY: 0.966872 },
  "2": { minX: 0.00407, minY: 0.03352, maxX: 1.0, maxY: 0.878559 },
  "3": { minX: 0.006457, minY: 0.032147, maxX: 1.0, maxY: 0.883533 },
  "4": { minX: 0.034704, minY: 0.032952, maxX: 1.0, maxY: 0.744177 },
};

// ═══════════════════════════════════════════════════════════════════════════
// 1. computeFeatureExtent
// ═══════════════════════════════════════════════════════════════════════════

describe("computeFeatureExtent", () => {
  it("computes correct extent for floor 1", () => {
    const campus = loadCampus();
    const f1 = getFloorFeatures(campus, 1);
    const extent = computeFeatureExtent(f1);
    expect(extent.minX).toBeCloseTo(EXPECTED_EXTENTS["1"].minX, 4);
    expect(extent.minY).toBeCloseTo(EXPECTED_EXTENTS["1"].minY, 4);
    expect(extent.maxX).toBeCloseTo(EXPECTED_EXTENTS["1"].maxX, 4);
    expect(extent.maxY).toBeCloseTo(EXPECTED_EXTENTS["1"].maxY, 4);
  });

  it("computes correct extent for floor 2", () => {
    const campus = loadCampus();
    const f2 = getFloorFeatures(campus, 2);
    const extent = computeFeatureExtent(f2);
    expect(extent.minX).toBeCloseTo(EXPECTED_EXTENTS["2"].minX, 4);
    expect(extent.minY).toBeCloseTo(EXPECTED_EXTENTS["2"].minY, 4);
    expect(extent.maxX).toBeCloseTo(EXPECTED_EXTENTS["2"].maxX, 4);
    expect(extent.maxY).toBeCloseTo(EXPECTED_EXTENTS["2"].maxY, 4);
  });

  it("computes correct extent for floor 3", () => {
    const campus = loadCampus();
    const f3 = getFloorFeatures(campus, 3);
    const extent = computeFeatureExtent(f3);
    expect(extent.minX).toBeCloseTo(EXPECTED_EXTENTS["3"].minX, 4);
    expect(extent.minY).toBeCloseTo(EXPECTED_EXTENTS["3"].minY, 4);
    expect(extent.maxX).toBeCloseTo(EXPECTED_EXTENTS["3"].maxX, 4);
    expect(extent.maxY).toBeCloseTo(EXPECTED_EXTENTS["3"].maxY, 4);
  });

  it("computes correct extent for floor 4", () => {
    const campus = loadCampus();
    const f4 = getFloorFeatures(campus, 4);
    const extent = computeFeatureExtent(f4);
    expect(extent.minX).toBeCloseTo(EXPECTED_EXTENTS["4"].minX, 4);
    expect(extent.minY).toBeCloseTo(EXPECTED_EXTENTS["4"].minY, 4);
    expect(extent.maxX).toBeCloseTo(EXPECTED_EXTENTS["4"].maxX, 4);
    expect(extent.maxY).toBeCloseTo(EXPECTED_EXTENTS["4"].maxY, 4);
  });

  it("returns Infinity for empty array", () => {
    const extent = computeFeatureExtent([]);
    expect(extent.minX).toBe(Infinity);
    expect(extent.minY).toBe(Infinity);
    expect(extent.maxX).toBe(-Infinity);
    expect(extent.maxY).toBe(-Infinity);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. resolveFloorAnchors — explicit per-floor locals
// ═══════════════════════════════════════════════════════════════════════════

describe("resolveFloorAnchors", () => {
  it("resolves per-floor locals from fixture", () => {
    const cps = loadControlPoints().filter((cp: any) => cp.role === "control");
    const result = resolveFloorAnchors(cps);

    // Floors 1-3 use the five baseline controls plus A8/student-room shared anchors.
    expect(result.byFloor["1"]).toHaveLength(7);
    expect(result.byFloor["2"]).toHaveLength(7);
    expect(result.byFloor["3"]).toHaveLength(7);
    // Floor 4 uses shared anchors plus vetted low-skew courtyard anchors.
    expect(result.byFloor["4"]).toHaveLength(7);

    // All anchors should have source "manual-floor"
    for (const level of ["1", "2", "3", "4"]) {
      if (result.byFloor[level]) {
        for (const a of result.byFloor[level]) {
          expect(a.source).toBe("manual-floor");
        }
      }
    }
  });

  it("each anchor has id, label, local, lngLat, role", () => {
    const cps = loadControlPoints().filter((cp: any) => cp.role === "control");
    const result = resolveFloorAnchors(cps);

    for (const level of ["1", "2", "3"]) {
      for (const a of result.byFloor[level]) {
        expect(a).toHaveProperty("id");
        expect(a).toHaveProperty("label");
        expect(a.local).toHaveLength(2);
        expect(a.lngLat).toHaveLength(2);
        expect(a.role).toBe("control");
      }
    }
  });

  it("reports missing entries for floors without explicit locals", () => {
    const cps = loadControlPoints().filter((cp: any) => cp.role === "control");
    const result = resolveFloorAnchors(cps);

    // cp-1 has no floor 4 entry → should be in missing
    const cp1Missing = result.missing.filter(
      (m: any) => m.id === "cp-1" && m.level === "4"
    );
    expect(cp1Missing.length).toBeGreaterThanOrEqual(1);

    // cp-3, cp-4, cp-7 also missing floor 4
    for (const id of ["cp-3", "cp-4", "cp-7"]) {
      const missingEntries = result.missing.filter(
        (m: any) => m.id === id && m.level === "4"
      );
      expect(missingEntries.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("legacy flat local format maps to floor 1 only", () => {
    const legacyPoints = [
      { id: "a", label: "A", local: [0, 0], lngLat: [129.0, 35.1], role: "control" },
      { id: "b", label: "B", local: [1, 0], lngLat: [129.002, 35.1], role: "control" },
      { id: "c", label: "C", local: [0, 1], lngLat: [129.0, 35.1018], role: "control" },
      { id: "d", label: "D", local: [0.5, 0.5], lngLat: [129.001, 35.1009], role: "control" },
    ];

    const result = resolveFloorAnchors(legacyPoints);
    expect(result.byFloor["1"]).toHaveLength(4);
    expect(result.byFloor["2"]).toBeUndefined();
    // Legacy points have no locals → no cross-floor missing entries
    expect(result.missing.filter((m: any) => m.level)).toHaveLength(0);
  });

  it("only role=control points are included", () => {
    const mixedPoints = [
      { id: "a", label: "A", local: [0, 0], lngLat: [129.0, 35.1], role: "control" },
      { id: "b", label: "B", local: [1, 0], lngLat: [129.002, 35.1], role: "checkpoint" },
    ];

    const result = resolveFloorAnchors(mixedPoints);
    expect(result.byFloor["1"]).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. computePerFloorTransforms integration
// ═══════════════════════════════════════════════════════════════════════════

describe("computePerFloorTransforms", () => {
  it("computes transforms for floors 1-3 with explicit anchors", async () => {
    const { computePerFloorTransforms } = await import(
      "../../scripts/compute-floor-anchors.mjs"
    );

    const campus = loadCampus();
    const cps = loadControlPoints();

    const result = await computePerFloorTransforms(campus, cps);

    // Floors 1-3 have >=4 explicit anchors → transforms computed
    expect(result.transforms["1"]).toBeDefined();
    expect(result.transforms["2"]).toBeDefined();
    expect(result.transforms["3"]).toBeDefined();
    // Floor 4 now has vetted F4-only anchors → transform computed.
    expect(result.transforms["4"]).toBeDefined();

    // Each computed transform should have forward and inverse
    for (const level of ["1", "2", "3"]) {
      const t = result.transforms[level];
      expect(t.forward).toHaveLength(6);
      expect(t.inverse).toHaveLength(6);
      for (const c of t.forward) {
        expect(Number.isFinite(c)).toBe(true);
      }
      for (const c of t.inverse) {
        expect(Number.isFinite(c)).toBe(true);
      }
    }
  });

  it("reports have quality metrics for all floors", async () => {
    const { computePerFloorTransforms } = await import(
      "../../scripts/compute-floor-anchors.mjs"
    );

    const campus = loadCampus();
    const cps = loadControlPoints();

    const result = await computePerFloorTransforms(campus, cps);

    for (const level of ["1", "2", "3", "4"]) {
      const r = result.reports[level];
      expect(r).toBeDefined();
      expect(r.anchorCount).toBeGreaterThanOrEqual(4);
      expect(Number.isFinite(r.rms)).toBe(true);
      expect(Number.isFinite(r.maxResidual)).toBe(true);
      expect(r.transformCoefficients).toHaveLength(6);
      expect(r.inverseCoefficients).toHaveLength(6);
      expect(r.correctionStatus).toBe("corrected");
    }
  });

  it("all corrected floor transforms produce valid WGS84 coordinates", async () => {
    const { computePerFloorTransforms } = await import(
      "../../scripts/compute-floor-anchors.mjs"
    );

    const campus = loadCampus();
    const cps = loadControlPoints();

    const result = await computePerFloorTransforms(campus, cps);

    // Test corrected floors.
    for (const level of ["1", "2", "3", "4"]) {
      const t = result.transforms[level];
      const fwd = t.forward;

      const [lng, lat] = [
        fwd[0] * 0.5 + fwd[1] * 0.5 + fwd[2],
        fwd[3] * 0.5 + fwd[4] * 0.5 + fwd[5],
      ];

      expect(lng).toBeGreaterThan(128);
      expect(lng).toBeLessThan(130);
      expect(lat).toBeGreaterThan(35);
      expect(lat).toBeLessThan(36);
    }
  });

  it("anchors are reported for corrected floors", async () => {
    const { computePerFloorTransforms } = await import(
      "../../scripts/compute-floor-anchors.mjs"
    );

    const campus = loadCampus();
    const cps = loadControlPoints();

    const result = await computePerFloorTransforms(campus, cps);

    // Corrected floors have anchors.
    for (const level of ["1", "2", "3", "4"]) {
      expect(result.anchors[level]).toBeDefined();
      expect(result.anchors[level].length).toBeGreaterThanOrEqual(4);
    }
  });

  it("floor 1 uses manual-floor anchors from fixture", async () => {
    const { computePerFloorTransforms } = await import(
      "../../scripts/compute-floor-anchors.mjs"
    );

    const campus = loadCampus();
    const cps = loadControlPoints();

    const result = await computePerFloorTransforms(campus, cps);

    for (const a of result.anchors["1"]) {
      expect(a.source).toBe("manual-floor");
    }
  });

  it("floors 2-3 use manual-floor anchors from fixture", async () => {
    const { computePerFloorTransforms } = await import(
      "../../scripts/compute-floor-anchors.mjs"
    );

    const campus = loadCampus();
    const cps = loadControlPoints();

    const result = await computePerFloorTransforms(campus, cps);

    for (const level of ["2", "3"]) {
      for (const a of result.anchors[level]) {
        expect(a.source).toBe("manual-floor");
      }
    }
  });

  it("missing anchors are reported with reasons", async () => {
    const { computePerFloorTransforms } = await import(
      "../../scripts/compute-floor-anchors.mjs"
    );

    const campus = loadCampus();
    const cps = loadControlPoints();

    const result = await computePerFloorTransforms(campus, cps);

    // Should have missing entries for floor 4 anchors
    expect(result.missing.length).toBeGreaterThan(0);
    const floor4Missing = result.missing.filter((m: any) => m.level === "4");
    expect(floor4Missing.length).toBeGreaterThanOrEqual(4); // cp-1, cp-3, cp-4, cp-7
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Structural feature counts
// ═══════════════════════════════════════════════════════════════════════════

describe("structural features per floor", () => {
  it("each floor has at least some structural features", () => {
    const campus = loadCampus();

    for (let level = 1; level <= 4; level++) {
      const structurals = getStructuralFeatures(campus, level);
      expect(structurals.length).toBeGreaterThan(0);
    }
  });

  it("structural features count matches expected", () => {
    const campus = loadCampus();
    const expected = { "1": 7, "2": 18, "3": 15, "4": 9 };

    for (const [level, count] of Object.entries(expected)) {
      const structurals = getStructuralFeatures(campus, Number(level));
      expect(structurals.length).toBe(count);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Error handling
// ═══════════════════════════════════════════════════════════════════════════

describe("error handling", () => {
  it("returns empty transforms when fewer than 4 control points", async () => {
    const { computePerFloorTransforms } = await import(
      "../../scripts/compute-floor-anchors.mjs"
    );

    const campus = loadCampus();
    const tooFewPoints = [
      { id: "a", label: "A", local: [0, 0], lngLat: [129.0, 35.1], role: "control" },
      { id: "b", label: "B", local: [1, 0], lngLat: [129.002, 35.1], role: "control" },
      { id: "c", label: "C", local: [0, 1], lngLat: [129.0, 35.1018], role: "control" },
    ];

    const result = await computePerFloorTransforms(campus, tooFewPoints);
    // No transforms computed — each floor has <4 explicit anchors
    expect(Object.keys(result.transforms)).toHaveLength(0);
    // Floor 1 report should indicate insufficient anchors
    expect(result.reports["1"].error).toMatch(/need 4/i);
  });

  it("checkpoints are excluded — 3 controls + 1 checkpoint returns no transforms", async () => {
    const { computePerFloorTransforms } = await import(
      "../../scripts/compute-floor-anchors.mjs"
    );

    const campus = loadCampus();
    const mixedPoints = [
      { id: "a", label: "A", local: [0, 0], lngLat: [129.0, 35.1], role: "control" },
      { id: "b", label: "B", local: [1, 0], lngLat: [129.002, 35.1], role: "control" },
      { id: "c", label: "C", local: [0, 1], lngLat: [129.0, 35.1018], role: "control" },
      { id: "d", label: "D", local: [0.5, 0.5], lngLat: [129.001, 35.1009], role: "checkpoint" },
    ];

    const result = await computePerFloorTransforms(campus, mixedPoints);
    // Only 3 controls → no transforms
    expect(Object.keys(result.transforms)).toHaveLength(0);
    expect(result.reports["1"].error).toMatch(/need 4/i);
  });

  it("handles empty campus data gracefully", async () => {
    const { computePerFloorTransforms } = await import(
      "../../scripts/compute-floor-anchors.mjs"
    );

    const emptyCampus = { type: "FeatureCollection", features: [] };
    const cps = loadControlPoints();

    await expect(
      computePerFloorTransforms(emptyCampus, cps)
    ).rejects.toThrow(/Floor 1 has no features/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. CLI integration
// ═══════════════════════════════════════════════════════════════════════════

describe("CLI integration", () => {
  const EVIDENCE_DIR = resolve(".sisyphus/evidence");
  const TMP_OUTPUT = resolve(EVIDENCE_DIR, "task-9-floor-anchors-report.json");

  it("exits 0 with valid inputs and writes report", () => {
    const { execSync } = require("node:child_process");

    execSync(
      `node scripts/compute-floor-anchors.mjs --campus "${CAMPUS_PATH}" --control-points "${CONTROL_POINTS_PATH}" --output "${TMP_OUTPUT}"`,
      { encoding: "utf-8" }
    );

    expect(existsSync(TMP_OUTPUT)).toBe(true);

    const raw = readFileSync(TMP_OUTPUT, "utf-8");
    const report = JSON.parse(raw);

    expect(report.generatedAt).toBeDefined();
    expect(report.summary.floors).toBe(4);
    expect(report.perFloorReports["1"].rms).toBeGreaterThan(0);
    expect(report.perFloorReports["2"].transformCoefficients).toHaveLength(6);
    expect(report.perFloorReports["3"].transformCoefficients).toHaveLength(6);

    // Floor 4 now has vetted F4-only anchors.
    expect(report.perFloorReports["4"].transformCoefficients).toHaveLength(6);
    expect(report.perFloorReports["4"].rms).toBeGreaterThan(0);

    // Verify transforms exist for corrected floors only
    expect(report.transforms["1"]).toBeDefined();
    expect(report.transforms["2"]).toBeDefined();
    expect(report.transforms["3"]).toBeDefined();
    expect(report.transforms["4"]).toBeDefined();
  });
});
