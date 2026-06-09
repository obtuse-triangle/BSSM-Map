#!/usr/bin/env node

/**
 * compute-georeference.mjs — Compute affine least-squares georeference
 * transform from control points and a campus GeoJSON.
 *
 * Usage:
 *   node scripts/compute-georeference.mjs \
 *     --control-points <path> \
 *     [--geojson <path>] \
 *     --output <path>
 *
 * Exits 0 when thresholds pass, 1 on validation failure or threshold exceed.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// ═══════════════════════════════════════════════════════════════════════════
// Matrix helpers (3×3 only — no external deps)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Transpose an n×3 matrix to 3×n.
 * @param {number[][]} rows — array of [x, y, 1] rows
 * @returns {number[][]} 3×n matrix
 */
function transpose3xN(rows) {
  return [
    rows.map((r) => r[0]),
    rows.map((r) => r[1]),
    rows.map((r) => r[2]),
  ];
}

/**
 * Multiply a 3×n matrix by an n×3 matrix → 3×3.
 * @param {number[][]} AT — 3×n
 * @param {number[][]} A  — n×3
 * @returns {number[][]} 3×3
 */
function mul3xNxNx3(AT, A) {
  const n = A.length;
  const out = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += AT[i][k] * A[k][j];
      out[i][j] = s;
    }
  }
  return out;
}

/**
 * Multiply a 3×n matrix by an n-vector → 3-vector.
 * @param {number[][]} AT — 3×n
 * @param {number[]} b   — length n
 * @returns {number[]} length 3
 */
function mul3xNxVec(AT, b) {
  const n = b.length;
  const out = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    let s = 0;
    for (let k = 0; k < n; k++) s += AT[i][k] * b[k];
    out[i] = s;
  }
  return out;
}

/**
 * Invert a 3×3 matrix using the standard formula.
 * @param {number[][]} m — 3×3
 * @returns {number[][]} inverse
 */
function mat3x3Inverse(m) {
  const a = m[0][0], b = m[0][1], c = m[0][2];
  const d = m[1][0], e = m[1][1], f = m[1][2];
  const g = m[2][0], h = m[2][1], i = m[2][2];

  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-18) {
    throw new Error(
      "Singular matrix — control points may be collinear or degenerate"
    );
  }
  const invDet = 1 / det;

  return [
    [(e * i - f * h) * invDet, (c * h - b * i) * invDet, (b * f - c * e) * invDet],
    [(f * g - d * i) * invDet, (a * i - c * g) * invDet, (c * d - a * f) * invDet],
    [(d * h - e * g) * invDet, (b * g - a * h) * invDet, (a * e - b * d) * invDet],
  ];
}

/**
 * Multiply a 3×3 matrix by a 3-vector.
 * @param {number[][]} M — 3×3
 * @param {number[]} v   — length 3
 * @returns {number[]} length 3
 */
function mul3x3xVec(M, v) {
  return [
    M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
    M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
    M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2],
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// Math helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert a longitude/latitude offset to metres at a given reference latitude.
 * Uses spherical-Earth approximation (sufficient for campus scale).
 *
 * @param {number} dLng — offset in degrees longitude
 * @param {number} dLat — offset in degrees latitude
 * @param {number} centroidLatDeg — reference latitude in degrees
 * @returns {{ dx: number, dy: number }} offset in metres
 */
function degreesToMetres(dLng, dLat, centroidLatDeg) {
  const latRad = (centroidLatDeg * Math.PI) / 180;
  const mPerDegLng = 111320 * Math.cos(latRad);
  const mPerDegLat = 111320;
  return { dx: dLng * mPerDegLng, dy: dLat * mPerDegLat };
}

/**
 * Compute the centroid (mean lng, mean lat) from an array of control points.
 * @param {object[]} points
 * @returns {[number, number]} [lng, lat]
 */
function centroid(points) {
  let lng = 0, lat = 0;
  for (const p of points) {
    lng += p.lngLat[0];
    lat += p.lngLat[1];
  }
  return [lng / points.length, lat / points.length];
}

// ═══════════════════════════════════════════════════════════════════════════
// Core functions (exported for testing)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resolve the local coordinate from a control point, handling both formats:
 *   - New format: "locals" map (per-floor), e.g. { "1": [x,y], "2": [x,y] }
 *   - Legacy format: flat "local" array, e.g. [x, y]
 *
 * @param {object} cp — control point object
 * @param {string} [level="1"] — floor level key
 * @returns {number[] | undefined} [x, y] or undefined if not available
 */
function resolveLocal(cp, level = "1") {
  if (cp.locals && typeof cp.locals === "object" && !Array.isArray(cp.locals)) {
    return cp.locals[level];
  }
  if (cp.local && Array.isArray(cp.local)) {
    return cp.local;
  }
  return undefined;
}

/**
 * Compute an affine least-squares transform from control points.
 *
 * Forward: maps local [x, y] → WGS84 [lng, lat]
 *   lng = a*x + b*y + c
 *   lat = d*x + e*y + f
 *
 * Inverse: maps WGS84 [lng, lat] → local [x, y]
 *   x = A*lng + B*lat + C
 *   y = D*lng + E*lat + F
 *
 * Uses normal equations: (A^T·A)^{-1}·A^T·b
 *
 * @param {object[]} controlPoints — array of ControlPoint objects
 * @param {string} [level="1"] — floor level key for resolving local coords
 * @returns {{ forward: number[], inverse: number[] }}
 * @throws {Error} if fewer than 4 points or singular matrix
 */
export function computeAffineTransform(controlPoints, level = "1") {
  const n = controlPoints.length;
  if (n < 4) {
    throw new Error(
      `At least 4 control points are required for affine transform, got ${n}`
    );
  }

  // ── Forward: local → WGS84 ──────────────────────────────────────
  // A matrix columns: [localX, localY, 1]
  const A = controlPoints.map((cp) => {
    const local = resolveLocal(cp, level);
    if (!local) throw new Error(`Control point "${cp.id}" has no local coordinates for floor ${level}`);
    return [local[0], local[1], 1];
  });
  const AT = transpose3xN(A);

  const ATA = mul3xNxNx3(AT, A);
  const ATAInv = mat3x3Inverse(ATA);

  // b vectors
  const bLng = controlPoints.map((cp) => cp.lngLat[0]);
  const bLat = controlPoints.map((cp) => cp.lngLat[1]);

  const ATbLng = mul3xNxVec(AT, bLng);
  const ATbLat = mul3xNxVec(AT, bLat);

  const coeffLng = mul3x3xVec(ATAInv, ATbLng); // [a, b, c]
  const coeffLat = mul3x3xVec(ATAInv, ATbLat);  // [d, e, f]

  const forward = [...coeffLng, ...coeffLat];   // [a, b, c, d, e, f]

  // ── Inverse: WGS84 → local ──────────────────────────────────────
  // Center lng/lat for numerical stability (values ~129/35 vs constant 1)
  const [cntLng, cntLat] = centroid(controlPoints);
  const A_inv = controlPoints.map((cp) => [
    cp.lngLat[0] - cntLng,
    cp.lngLat[1] - cntLat,
    1,
  ]);
  const AT_inv = transpose3xN(A_inv);

  const ATA_inv = mul3xNxNx3(AT_inv, A_inv);
  const ATAInv_inv = mat3x3Inverse(ATA_inv);

  const bLocalX = controlPoints.map((cp) => resolveLocal(cp, level)[0]);
  const bLocalY = controlPoints.map((cp) => resolveLocal(cp, level)[1]);

  const ATbX = mul3xNxVec(AT_inv, bLocalX);
  const ATbY = mul3xNxVec(AT_inv, bLocalY);

  const coeffXc = mul3x3xVec(ATAInv_inv, ATbX); // [A, B, C] — centered
  const coeffYc = mul3x3xVec(ATAInv_inv, ATbY); // [D, E, F] — centered

  // Un-center: local_x = A*(lng-cntLng) + B*(lat-cntLat) + C
  //                    = A*lng + B*lat + (C - A*cntLng - B*cntLat)
  const inverse = [
    coeffXc[0],
    coeffXc[1],
    coeffXc[2] - coeffXc[0] * cntLng - coeffXc[1] * cntLat,
    coeffYc[0],
    coeffYc[1],
    coeffYc[2] - coeffYc[0] * cntLng - coeffYc[1] * cntLat,
  ];

  return { forward, inverse };
}

/**
 * Apply the forward affine transform to a [localX, localY] coordinate.
 *
 * @param {number[]} coefficients — [a, b, c, d, e, f]
 * @param {number} localX
 * @param {number} localY
 * @returns {[number, number]} [lng, lat]
 */
function applyForward(coefficients, localX, localY) {
  const [a, b, c, d, e, f] = coefficients;
  return [
    a * localX + b * localY + c,
    d * localX + e * localY + f,
  ];
}

/**
 * Apply the inverse affine transform to a [lng, lat] coordinate.
 *
 * @param {number[]} coefficients — [A, B, C, D, E, F]
 * @param {number} lng
 * @param {number} lat
 * @returns {[number, number]} [localX, localY]
 */
function applyInverse(coefficients, lng, lat) {
  const [A, B, C, D, E, F] = coefficients;
  return [
    A * lng + B * lat + C,
    D * lng + E * lat + F,
  ];
}

/**
 * Compute per-point residuals in metres after applying the forward transform.
 *
 * @param {object[]} controlPoints — ControlPoint objects
 * @param {{ forward: number[], inverse: number[] }} transform
 * @returns {{ pointId: string, dx: number, dy: number, distance: number }[]}
 */
export function computeResiduals(controlPoints, transform, level = "1") {
  const [centerLng, centerLat] = centroid(controlPoints);

  return controlPoints.map((cp) => {
    const local = resolveLocal(cp, level);
    if (!local) throw new Error(`Control point "${cp.id}" has no local coordinates for floor ${level}`);
    const [predLng, predLat] = applyForward(transform.forward, local[0], local[1]);
    const dLng = predLng - cp.lngLat[0];
    const dLat = predLat - cp.lngLat[1];
    const { dx, dy } = degreesToMetres(dLng, dLat, centerLat);
    const distance = Math.sqrt(dx * dx + dy * dy);
    return {
      pointId: cp.id,
      dx: round6(dx),
      dy: round6(dy),
      distance: round6(distance),
    };
  });
}

/**
 * Compute the centroid lat (in degrees) from an array of control points.
 *
 * @param {object[]} controlPoints
 * @returns {number} latitude in degrees
 */
export function computeCentroidLat(controlPoints) {
  return centroid(controlPoints)[1];
}

/**
 * Convert a degree offset to metres at a given reference latitude.
 * Exported for testing.
 *
 * @param {number} dLng
 * @param {number} dLat
 * @param {number} refLatDeg
 * @returns {{ dx: number, dy: number }}
 */
export function convertDegreesToMetres(dLng, dLat, refLatDeg) {
  return degreesToMetres(dLng, dLat, refLatDeg);
}

/**
 * Validate a georeference solution against thresholds.
 *
 * @param {object[]} controlPoints
 * @param {{ forward: number[], inverse: number[] }} transform
 * @param {object} [options]
 * @param {number} [options.rmsThreshold=2.0] — RMS threshold in metres
 * @param {number} [options.maxResidualThreshold=5.0] — max residual in metres
 * @returns {{
 *   rms: number,
 *   maxResidual: number,
 *   passed: boolean,
 *   residuals: { pointId: string, dx: number, dy: number, distance: number }[],
 *   rmsThreshold: number,
 *   maxResidualThreshold: number,
 * }}
 */
export function validateGeoreference(controlPoints, transform, options) {
  const rmsThreshold = options?.rmsThreshold ?? 2.0;
  const maxResidualThreshold = options?.maxResidualThreshold ?? 5.0;

  const residuals = computeResiduals(controlPoints, transform);

  const distances = residuals.map((r) => r.distance);
  const sumSq = distances.reduce((s, d) => s + d * d, 0);
  const rms = round6(Math.sqrt(sumSq / distances.length));
  const maxResidual = round6(Math.max(...distances));

  const passed = rms <= rmsThreshold && maxResidual <= maxResidualThreshold;

  return { rms, maxResidual, passed, residuals, rmsThreshold, maxResidualThreshold };
}

/**
 * Build a full georeference report object.
 *
 * @param {object[]} controlPoints
 * @param {{ forward: number[], inverse: number[] }} transform
 * @param {object} validation — result of validateGeoreference()
 * @returns {object}
 */
export function buildReport(controlPoints, transform, validation) {
  return {
    transformType: "affine",
    coefficients: transform.forward,
    forwardCoefficients: transform.forward,
    inverseCoefficients: transform.inverse,
    controlPoints: controlPoints.map((cp) => {
      const entry = {
        id: cp.id,
        label: cp.label,
        lngLat: cp.lngLat,
        role: cp.role,
      };
      if (cp.locals) entry.locals = cp.locals;
      if (cp.local) entry.local = cp.local;
      return entry;
    }),
    residuals: validation.residuals.map((r) => ({
      pointId: r.pointId,
      dx: r.dx,
      dy: r.dy,
      distance: r.distance,
    })),
    rms: validation.rms,
    maxResidual: validation.maxResidual,
    passed: validation.passed,
    thresholds: {
      rms: validation.rmsThreshold,
      maxResidual: validation.maxResidualThreshold,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════════════════

function parseArgs() {
  const args = process.argv.slice(2);
  let controlPointsPath = null;
  let geojsonPath = null;
  let outputPath = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--control-points" && i + 1 < args.length) {
      controlPointsPath = resolve(args[++i]);
    } else if (args[i] === "--geojson" && i + 1 < args.length) {
      geojsonPath = resolve(args[++i]);
    } else if (args[i] === "--output" && i + 1 < args.length) {
      outputPath = resolve(args[++i]);
    }
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

  return { controlPointsPath, geojsonPath, outputPath };
}

function main() {
  const args = parseArgs();

  // Read control points
  let controlPoints;
  try {
    const raw = readFileSync(args.controlPointsPath, "utf-8");
    controlPoints = JSON.parse(raw);
  } catch (e) {
    console.error(`Error: invalid JSON in control points file — ${e.message}`);
    process.exit(1);
  }

  if (!Array.isArray(controlPoints)) {
    console.error("Error: control points file must contain a JSON array");
    process.exit(1);
  }

  // Validate structure — supports both `local` (flat) and `locals` (per-floor map)
  for (let i = 0; i < controlPoints.length; i++) {
    const cp = controlPoints[i];
    const hasLocal = Array.isArray(cp.local) && cp.local.length === 2;
    const hasLocals = cp.locals && typeof cp.locals === "object" && !Array.isArray(cp.locals) && Object.keys(cp.locals).length > 0;
    if (!cp.id || !cp.label || (!hasLocal && !hasLocals) || !Array.isArray(cp.lngLat) || !cp.role) {
      console.error(`Error: control point at index ${i} has invalid structure`);
      console.error(`  Expected: { id, label, local: [x,y] OR locals: { "1": [x,y], ... }, lngLat: [lng,lat], role }`);
      process.exit(1);
    }
  }

  // Read GeoJSON if provided (optional validation)
  if (args.geojsonPath) {
    if (!existsSync(args.geojsonPath)) {
      console.error(`Warning: GeoJSON file "${args.geojsonPath}" not found, skipping validation`);
    } else {
      validateAgainstGeojson(controlPoints, args.geojsonPath);
    }
  }

  // Compute
  let transform;
  try {
    transform = computeAffineTransform(controlPoints);
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }

  const validation = validateGeoreference(controlPoints, transform);
  const report = buildReport(controlPoints, transform, validation);

  // Write output
  writeFileSync(args.outputPath, JSON.stringify(report, null, 2), "utf-8");

  // Report to stderr
  console.error(
    `Wrote georeference report to ${args.outputPath} — ` +
    `RMS: ${validation.rms.toFixed(3)}m, max: ${validation.maxResidual.toFixed(3)}m, ` +
    `passed: ${validation.passed}`
  );

  if (!validation.passed) {
    console.error("Thresholds exceeded. Exiting with code 1.");
    process.exit(1);
  }
}

/**
 * Validate that control point local coordinates fall within the GeoJSON
 * extent. Prints warnings for out-of-range points (non-fatal).
 */
function validateAgainstGeojson(controlPoints, geojsonPath) {
  let geojson;
  try {
    geojson = JSON.parse(readFileSync(geojsonPath, "utf-8"));
  } catch {
    return;
  }

  if (!geojson.features) return;

  // Find the bounding box of all features
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of geojson.features) {
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

  if (!isFinite(minX)) return;

  for (const cp of controlPoints) {
    const localResolved = resolveLocal(cp);
    if (!localResolved) continue;
    const [x, y] = localResolved;
    if (x < minX - 0.01 || x > maxX + 0.01 || y < minY - 0.01 || y > maxY + 0.01) {
      console.error(
        `Warning: control point "${cp.id}" local [${x},${y}] is outside ` +
        `GeoJSON extent [${minX.toFixed(3)},${maxX.toFixed(3)}]×[${minY.toFixed(3)},${maxY.toFixed(3)}]`
      );
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function round6(v) {
  return Math.round(v * 1e6) / 1e6;
}

// ═══════════════════════════════════════════════════════════════════════════
// Entry
// ═══════════════════════════════════════════════════════════════════════════

const isMain =
  process.argv[1] &&
  (import.meta.url === `file://${process.argv[1]}` ||
    import.meta.url.endsWith(process.argv[1].split("/").pop() || ""));

if (isMain) {
  main();
}
