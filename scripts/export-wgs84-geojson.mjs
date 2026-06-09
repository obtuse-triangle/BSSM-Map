#!/usr/bin/env node

/**
 * export-wgs84-geojson.mjs — Apply affine georeference transform to convert
 * local (normalized) GeoJSON to WGS84 GeoJSON.
 *
 * Reads a canonical local CampusFeatureCollection (coordinateSystem: "local"),
 * applies the forward affine transform computed from control points, and
 * writes a WGS84 FeatureCollection (coordinateSystem: "WGS84", units: "degrees").
 *
 * Usage:
 *   node scripts/export-wgs84-geojson.mjs \
 *     --input <local.geojson> \
 *     --control-points <points.json> \
 *     --output <wgs84.geojson>
 *
 * Exits 0 on success, 1 on any error.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// ═══════════════════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════════════════

function parseArgs() {
  const args = process.argv.slice(2);
  let inputPath = null;
  let controlPointsPath = null;
  let outputPath = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--input" && i + 1 < args.length) {
      inputPath = resolve(args[++i]);
    } else if (args[i] === "--control-points" && i + 1 < args.length) {
      controlPointsPath = resolve(args[++i]);
    } else if (args[i] === "--output" && i + 1 < args.length) {
      outputPath = resolve(args[++i]);
    }
  }

  if (!inputPath) {
    console.error("Error: --input argument is required");
    process.exit(1);
  }

  if (!existsSync(inputPath)) {
    console.error(`Error: input file "${inputPath}" not found`);
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

  return { inputPath, controlPointsPath, outputPath };
}

// ═══════════════════════════════════════════════════════════════════════════
// Geometry transformation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply the forward affine transform to a single coordinate pair.
 *
 * @param {number[]} forward — [a, b, c, d, e, f]
 * @param {number} x — local X
 * @param {number} y — local Y
 * @returns {[number, number]} [lng, lat]
 */
function applyForward(forward, x, y) {
  return [
    forward[0] * x + forward[1] * y + forward[2],
    forward[3] * x + forward[4] * y + forward[5],
  ];
}

/**
 * Recursively transform all coordinate arrays in a GeoJSON geometry.
 * Handles Polygon and MultiPolygon geometries.
 *
 * @param {object} geometry — GeoJSON geometry object
 * @param {number[]} forward — [a, b, c, d, e, f] forward coefficients
 * @returns {object} new geometry with transformed coordinates
 */
function transformGeometry(geometry, forward) {
  if (geometry.type === "Polygon") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((ring) =>
        ring.map(([x, y]) => applyForward(forward, x, y))
      ),
    };
  }

  if (geometry.type === "MultiPolygon") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((polygon) =>
        polygon.map((ring) =>
          ring.map(([x, y]) => applyForward(forward, x, y))
        )
      ),
    };
  }

  // Pass through unknown geometry types unchanged
  console.error(
    `Warning: unsupported geometry type "${geometry.type}" — coordinates not transformed`
  );
  return geometry;
}

/**
 * Basic validation that geometry rings are closed (first === last).
 * Logs warnings but does not throw — allows processing to continue.
 *
 * @param {object} geometry
 * @returns {boolean}
 */
function validateRingsClosed(geometry) {
  if (geometry.type === "Polygon") {
    return geometry.coordinates.every(validateRing);
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.every((polygon) =>
      polygon.every(validateRing)
    );
  }
  return true;
}

/**
 * Check that a single ring is closed (first coord === last coord).
 */
function validateRing(ring) {
  if (ring.length < 2) return true;
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}

/**
 * Check all coordinates are finite numbers.
 *
 * @param {object} geometry
 * @returns {boolean}
 */
function validateFiniteCoords(geometry) {
  if (geometry.type === "Polygon") {
    return geometry.coordinates.every((ring) =>
      ring.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
    );
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.every((polygon) =>
      polygon.every((ring) =>
        ring.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
      )
    );
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  const { inputPath, controlPointsPath, outputPath } = parseArgs();

  // ── Read input GeoJSON ──────────────────────────────────────────
  let inputData;
  try {
    const raw = readFileSync(inputPath, "utf-8");
    inputData = JSON.parse(raw);
  } catch (e) {
    console.error(`Error: invalid JSON in input file — ${e.message}`);
    process.exit(1);
  }

  if (!inputData.type || inputData.type !== "FeatureCollection") {
    console.error("Error: input must be a GeoJSON FeatureCollection");
    process.exit(1);
  }

  // ── Read control points ────────────────────────────────────────
  let allPoints;
  try {
    const raw = readFileSync(controlPointsPath, "utf-8");
    allPoints = JSON.parse(raw);
  } catch (e) {
    console.error(`Error: invalid JSON in control points file — ${e.message}`);
    process.exit(1);
  }

  if (!Array.isArray(allPoints)) {
    console.error("Error: control points file must contain a JSON array");
    process.exit(1);
  }

  // Filter to control points only
  const controlPoints = allPoints.filter((cp) => cp.role === "control");

  if (controlPoints.length < 4) {
    console.error(
      `Error: at least 4 control points with role="control" are required, got ${controlPoints.length}`
    );
    process.exit(1);
  }

  // ── Compute per-floor affine transforms ────────────────────────
  const { computePerFloorTransforms } = await import(
    "./compute-floor-anchors.mjs"
  );

  let perFloorResult;
  try {
    perFloorResult = await computePerFloorTransforms(inputData, allPoints);
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }

  const { transforms: perFloorTransforms, reports } = perFloorResult;

  // Log per-floor transform quality
  for (const [level, r] of Object.entries(reports)) {
    if (r.rms != null) {
      console.error(
        `Floor ${level}: ${r.anchorCount} anchors, RMS ${r.rms.toFixed(3)}m, max ${r.maxResidual.toFixed(3)}m`
      );
    } else if (r.error) {
      console.error(
        `Floor ${level}: ${r.anchorCount} anchors — ${r.error}`
      );
    }
  }

  // ── Transform features ─────────────────────────────────────────
  const transformedFeatures = [];
  for (const feature of inputData.features) {
    const level = String(feature.properties.level);
    const floorTransform = perFloorTransforms[level];
    const forward = floorTransform ? floorTransform.forward : null;

    if (!forward) {
      console.error(
        `Warning: floor ${level} has no transform (feature ${feature.id}) — skipping`
      );
      continue;
    }

    const newGeometry = transformGeometry(feature.geometry, forward);

    // Validate transformed geometry
    if (!validateRingsClosed(newGeometry)) {
      console.error(
        `Warning: feature ${feature.id} has unclosed rings after transform`
      );
    }
    if (!validateFiniteCoords(newGeometry)) {
      console.error(
        `Error: feature ${feature.id} has non-finite coordinates after transform`
      );
      process.exit(1);
    }

    transformedFeatures.push({
      ...feature,
      geometry: newGeometry,
    });
  }

  if (transformedFeatures.length === 0) {
    console.error("Error: no features could be transformed (all floors uncorrected)");
    process.exit(1);
  }

  // ── Build output FeatureCollection ──────────────────────────────
  const outputData = {
    type: "FeatureCollection",
    features: transformedFeatures,
    metadata: {
      coordinateSystem: "WGS84",
      units: "degrees",
    },
  };

  // Preserve any extra root-level properties (e.g., buildingOutlines)
  for (const key of Object.keys(inputData)) {
    if (!["type", "features", "metadata"].includes(key)) {
      outputData[key] = inputData[key];
    }
  }

  // ── Write output ───────────────────────────────────────────────
  writeFileSync(outputPath, JSON.stringify(outputData, null, 2), "utf-8");

  console.error(
    `Wrote ${transformedFeatures.length} features to ${outputPath} — ` +
    `coordinateSystem: WGS84, units: degrees`
  );
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
