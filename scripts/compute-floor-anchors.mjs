#!/usr/bin/env node

/**
 * compute-floor-anchors.mjs — Compute per-floor affine transforms from
 * explicit per-floor local anchor coordinates.
 *
 * Each floor was independently normalized from HWPX grid data to [0,1],
 * so the same physical building corner has slightly different local
 * coordinates on each floor.  This script reads per-floor local coordinates
 * from the control-points fixture (via the `locals` map) and computes
 * independent affine transforms for each floor.
 *
 * Fixture format (preferred):
 *   { "id": "cp-1", "lngLat": [...], "role": "control",
 *     "locals": { "1": [x, y], "2": [x, y], ... } }
 *
 * Legacy fallback: a flat `local` array is read as floor-1 only.
 *
 * Strategy:
 *   1. Read per-floor locals from the control-points fixture
 *   2. For each floor, collect all anchors with explicit locals
 *   3. If a floor has <4 explicit anchors, skip it (no transform)
 *   4. Compute independent affine transforms per floor
 *
 * Usage:
 *   node scripts/compute-floor-anchors.mjs \
 *     --campus <campus.json> \
 *     --control-points <campus-control-points.json> \
 *     --output <report.json>
 *
 * Or import as a module (async):
 *   import { computePerFloorTransforms } from "./compute-floor-anchors.mjs";
 *   const result = await computePerFloorTransforms(campusData, controlPoints);
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// ═══════════════════════════════════════════════════════════════════════════
// Extent computation (kept for diagnostics)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute the bounding box extent of an array of GeoJSON features.
 *
 * @param {object[]} features — array of GeoJSON Feature objects
 * @returns {{ minX: number, minY: number, maxX: number, maxY: number }}
 */
export function computeFeatureExtent(features) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const f of features) {
    if (!f.geometry || !f.geometry.coordinates) continue;
    const ring = f.geometry.coordinates[0];
    if (!ring) continue;
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  return { minX, minY, maxX, maxY };
}

// ═══════════════════════════════════════════════════════════════════════════
// Per-floor anchor resolution
// ═══════════════════════════════════════════════════════════════════════════

function round6(v) {
  return Math.round(v * 1e6) / 1e6;
}

/**
 * Resolve per-floor anchors from the control-points fixture.
 *
 * Each control point may have:
 *   - `locals`: a map of levelKey -> [x, y] (per-floor explicit coordinates)
 *   - `local`: a flat [x, y] (used as floor-1 only, legacy)
 *
 * @param {object[]} controlPoints — parsed control points array
 * @returns {{
 *   byFloor: Record<string, object[]>,
 *   provenance: Record<string, string>,
 *   missing: object[]
 * }}
 */
export function resolveFloorAnchors(controlPoints) {
  const controls = controlPoints.filter((cp) => cp.role === "control");

  const byFloor = {};
  const provenance = {};
  const missing = [];

  for (const cp of controls) {
    const hasLocals = cp.locals && typeof cp.locals === "object" && !Array.isArray(cp.locals);

    if (hasLocals) {
      // Explicit per-floor locals — use them directly
      for (const [levelKey, local] of Object.entries(cp.locals)) {
        if (!Array.isArray(local) || local.length !== 2) {
          missing.push({
            id: cp.id,
            label: cp.label,
            level: levelKey,
            reason: `Invalid locals entry for floor ${levelKey}: not a [x, y] pair`,
          });
          continue;
        }
        if (!byFloor[levelKey]) byFloor[levelKey] = [];
        byFloor[levelKey].push({
          id: cp.id,
          label: cp.label,
          local,
          lngLat: cp.lngLat,
          role: "control",
          source: "manual-floor",
        });
      }
      // Track which points have per-floor data
      for (const levelKey of Object.keys(cp.locals)) {
        if (!provenance[levelKey]) provenance[levelKey] = [];
        provenance[levelKey].push(cp.id);
      }
    } else if (cp.local && Array.isArray(cp.local) && cp.local.length === 2) {
      // Legacy flat format — use as floor-1 only
      if (!byFloor["1"]) byFloor["1"] = [];
      byFloor["1"].push({
        id: cp.id,
        label: cp.label,
        local: cp.local,
        lngLat: cp.lngLat,
        role: "control",
        source: "real",
      });
      if (!provenance["1"]) provenance["1"] = [];
      provenance["1"].push(cp.id);
    } else {
      missing.push({
        id: cp.id,
        label: cp.label,
        reason: "No locals or local field found",
      });
    }
  }

  // Determine missing per-floor entries: floors with partial coverage
  // For each anchor that has locals, cross-check all floors in the fixture
  for (const cp of controls) {
    if (cp.locals && typeof cp.locals === "object") {
      // Collect all floor keys across all control points
      const allFloorKeys = new Set();
      for (const cp2 of controls) {
        if (cp2.locals) {
          for (const k of Object.keys(cp2.locals)) {
            allFloorKeys.add(k);
          }
        }
      }
      for (const levelKey of allFloorKeys) {
        if (!cp.locals[levelKey]) {
          missing.push({
            id: cp.id,
            label: cp.label,
            level: levelKey,
            reason: `No explicit locals entry for floor ${levelKey}`,
          });
        }
      }
    }
  }

  return { byFloor, provenance, missing };
}

/**
 * Compute per-floor affine transforms from explicit per-floor anchors.
 *
 * @param {object} campusData — parsed campus.json (FeatureCollection)
 * @param {object[]} controlPoints — array from campus-control-points.json
 * @returns {Promise<{
 *   transforms: Record<string, { forward: number[], inverse: number[] }>,
 *   anchors: Record<string, object[]>,
 *   missing: object[],
 *   reports: Record<string, object>,
 * }>}
 */
export async function computePerFloorTransforms(campusData, controlPoints) {
  const { computeAffineTransform, computeResiduals } = await import(
    "./compute-georeference.mjs"
  );

  // Group features by level for diagnostics
  const byLevel = {};
  for (const f of campusData.features) {
    const level = String(f.properties.level);
    if (!byLevel[level]) byLevel[level] = [];
    byLevel[level].push(f);
  }

  // Ensure at least floor 1 exists
  if (!byLevel["1"] || byLevel["1"].length === 0) {
    throw new Error("Floor 1 has no features — cannot compute transforms");
  }

  // Resolve explicit per-floor anchors
  const { byFloor, missing } = resolveFloorAnchors(controlPoints);

  const transforms = {};
  const allAnchors = {};
  const allMissing = { 1: [], 2: [], 3: [], 4: [] };
  for (const m of missing) {
    const lv = m.level;
    if (lv && allMissing[lv]) allMissing[lv].push(m);
  }

  const reports = {};

  // Process each floor that has features
  for (let level = 1; level <= 4; level++) {
    const levelKey = String(level);
    const floorFeatures = byLevel[levelKey];

    if (!floorFeatures || floorFeatures.length === 0) {
      reports[levelKey] = {
        floor: level,
        anchorCount: 0,
        omittedCount: (byFloor[levelKey] || []).length,
        extent: null,
        error: `Floor ${level} has no features — transform not computed`,
      };
      continue;
    }

    const extent = computeFeatureExtent(floorFeatures);
    const structuralCount = floorFeatures.filter(
      (f) => f.properties.category === "structural"
    ).length;

    const floorAnchors = byFloor[levelKey] || [];

    if (floorAnchors.length < 4) {
      const omittedEntries = floorAnchors.map((a) => ({
        id: a.id,
        label: a.label,
        reason: `Only ${floorAnchors.length} explicit anchors for floor ${levelKey} — need 4`,
        local: a.local,
      }));
      reports[levelKey] = {
        floor: level,
        anchorCount: floorAnchors.length,
        omittedCount: missing.filter((m) => m.level === levelKey).length,
        extent,
        structuralFeatureCount: structuralCount,
        error: `Only ${floorAnchors.length} explicit anchors (need 4) — transform not computed`,
        anchors: floorAnchors.map((a) => ({
          id: a.id,
          label: a.label,
          local: a.local,
          lngLat: a.lngLat,
          source: a.source,
        })),
        omitted: [
          ...omittedEntries,
          ...missing.filter((m) => m.level === levelKey).map((m) => ({
            id: m.id,
            label: m.label,
            reason: m.reason,
          })),
        ],
      };
      continue;
    }

    allAnchors[levelKey] = floorAnchors;

    // Compute affine transform for this floor
    try {
      const transform = computeAffineTransform(floorAnchors);
      transforms[levelKey] = transform;

      const residuals = computeResiduals(floorAnchors, transform);
      const distances = residuals.map((r) => r.distance);
      const rms = round6(
        Math.sqrt(distances.reduce((s, d) => s + d * d, 0) / distances.length)
      );
      const maxRes = round6(Math.max(...distances));

      reports[levelKey] = {
        floor: level,
        anchorCount: floorAnchors.length,
        omittedCount: missing.filter((m) => m.level === levelKey).length,
        extent,
        structuralFeatureCount: structuralCount,
        transformCoefficients: transform.forward,
        inverseCoefficients: transform.inverse,
        rms,
        maxResidual: maxRes,
        correctionStatus: "corrected",
        residuals: residuals.map((r) => ({
          pointId: r.pointId,
          dx: r.dx,
          dy: r.dy,
          distance: r.distance,
        })),
        anchors: floorAnchors.map((a) => ({
          id: a.id,
          label: a.label,
          local: a.local,
          lngLat: a.lngLat,
          source: a.source,
        })),
        omitted: missing
          .filter((m) => m.level === levelKey)
          .map((m) => ({ id: m.id, label: m.label, reason: m.reason })),
      };
    } catch (e) {
      reports[levelKey] = {
        floor: level,
        anchorCount: floorAnchors.length,
        omittedCount: missing.filter((m) => m.level === levelKey).length,
        extent,
        error: `Affine transform failed: ${e.message}`,
        anchors: floorAnchors.map((a) => ({
          id: a.id,
          label: a.label,
          local: a.local,
          lngLat: a.lngLat,
          source: a.source,
        })),
        omitted: missing
          .filter((m) => m.level === levelKey)
          .map((m) => ({ id: m.id, label: m.label, reason: m.reason })),
      };
    }
  }

  return { transforms, anchors: allAnchors, missing, reports };
}

// ═══════════════════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════════════════

function parseArgs() {
  const args = process.argv.slice(2);
  let campusPath = null;
  let controlPointsPath = null;
  let outputPath = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--campus" && i + 1 < args.length) {
      campusPath = resolve(args[++i]);
    } else if (args[i] === "--control-points" && i + 1 < args.length) {
      controlPointsPath = resolve(args[++i]);
    } else if (args[i] === "--output" && i + 1 < args.length) {
      outputPath = resolve(args[++i]);
    }
  }

  if (!campusPath) {
    console.error("Error: --campus argument is required");
    process.exit(1);
  }
  if (!existsSync(campusPath)) {
    console.error(`Error: campus file "${campusPath}" not found`);
    process.exit(1);
  }
  if (!controlPointsPath) {
    console.error("Error: --control-points argument is required");
    process.exit(1);
  }
  if (!existsSync(controlPointsPath)) {
    console.error(`Error: control points file "${controlPointsPath}" not found`);
    process.exit(1);
  }
  if (!outputPath) {
    console.error("Error: --output argument is required");
    process.exit(1);
  }

  return { campusPath, controlPointsPath, outputPath };
}

async function main() {
  const { campusPath, controlPointsPath, outputPath } = parseArgs();

  // Read inputs
  let campusData;
  try {
    campusData = JSON.parse(readFileSync(campusPath, "utf-8"));
  } catch (e) {
    console.error(`Error: invalid JSON in campus file — ${e.message}`);
    process.exit(1);
  }

  if (!campusData.type || campusData.type !== "FeatureCollection") {
    console.error("Error: campus file must be a GeoJSON FeatureCollection");
    process.exit(1);
  }

  let controlPoints;
  try {
    controlPoints = JSON.parse(readFileSync(controlPointsPath, "utf-8"));
  } catch (e) {
    console.error(`Error: invalid JSON in control points file — ${e.message}`);
    process.exit(1);
  }

  if (!Array.isArray(controlPoints)) {
    console.error("Error: control points file must contain a JSON array");
    process.exit(1);
  }

  // Compute per-floor transforms
  let result;
  try {
    result = await computePerFloorTransforms(campusData, controlPoints);
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }

  // Build output report
  const report = {
    generatedAt: new Date().toISOString(),
    campusSource: campusPath,
    controlPointSource: controlPointsPath,
    summary: {
      floors: Object.keys(result.reports).length,
      totalAnchors: Object.values(result.reports).reduce(
        (s, r) => (r.anchorCount ? s + r.anchorCount : s),
        0
      ),
      totalOmitted: result.missing.length,
    },
    perFloorReports: result.reports,
    transforms: Object.fromEntries(
      Object.entries(result.transforms).map(([k, v]) => [
        k,
        { forward: v.forward, inverse: v.inverse },
      ])
    ),
  };

  // Print summary to stderr
  for (const [level, r] of Object.entries(result.reports)) {
    if (r.rms != null) {
      console.error(
        `Floor ${level}: ${r.anchorCount} anchors, RMS ${r.rms.toFixed(3)}m, max ${r.maxResidual.toFixed(3)}m — ${r.correctionStatus}`
      );
    } else if (r.error) {
      console.error(
        `Floor ${level}: ${r.anchorCount} anchors — ${r.error}`
      );
    } else {
      console.error(`Floor ${level}: ${r.anchorCount} anchors, no transform`);
    }
  }

  // Write output
  writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf-8");
  console.error(`\nWrote per-floor georeference report to ${outputPath}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Entry
// ═══════════════════════════════════════════════════════════════════════════

const isMain =
  process.argv[1] &&
  (import.meta.url === `file://${process.argv[1]}` ||
    import.meta.url.endsWith(process.argv[1].split("/").pop() || ""));

if (isMain) {
  main().catch((e) => {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  });
}
