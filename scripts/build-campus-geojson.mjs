#!/usr/bin/env node

/**
 * build-campus-geojson.mjs — Convert extracted HWPX table data to canonical GeoJSON.
 *
 * Reads the output of extract-hwpx.mjs and produces a CampusFeatureCollection
 * with normalized local coordinates in [0,1] range.
 *
 * Usage:
 *   node scripts/build-campus-geojson.mjs --input <raw.json> [--output <campus.geojson>]
 *
 * The script also detects building outline vertices (contiguous thick-bordered cells)
 * and attaches them as a `buildingOutlines` array in the output for georeferencing.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Thick border fill IDs (3+ sides of 0.4mm SOLID) — determined empirically
// ---------------------------------------------------------------------------
const THICK_BORDER_IDS = new Set([
  29, 34, 40, 41, 76, 92, 105, 113, 141, 142, 147, 204, 221, 229,
  245, 250, 251, 291, 301, 308, 309, 311, 320, 321, 343, 344, 379, 427, 430,
]);

// Border fill IDs that have ALL 4 sides thick (0.4mm SOLID)
const ALL_SIDES_THICK_IDS = new Set([41, 92, 204, 229, 245, 321]);

// X-pattern border fill IDs (slash=CENTER AND backSlash=CENTER) — diagonal cross
// These mark cells as "not accessible" areas in the HWPX floor plan
const X_PATTERN_IDS = new Set([210, 302, 307, 331, 332, 335, 336, 361, 369, 373, 383, 403, 416]);

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  let input = null;
  let output = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--input" && i + 1 < args.length) {
      input = resolve(args[++i]);
    } else if (args[i] === "--output" && i + 1 < args.length) {
      output = resolve(args[++i]);
    }
  }

  if (!input) {
    console.error("Error: --input argument is required");
    process.exit(1);
  }

  if (!existsSync(input)) {
    console.error(`Error: input file "${input}" not found`);
    process.exit(1);
  }

  return { input, output };
}

// ---------------------------------------------------------------------------
// Grid construction
// ---------------------------------------------------------------------------

/**
 * Fill zero entries in an array using nearest non-zero values.
 * @param {number[]} arr
 */
function fillZeros(arr) {
  // Forward fill
  let last = 0;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] === 0 && last > 0) arr[i] = last;
    else if (arr[i] > 0) last = arr[i];
  }
  // Backward fill (for leading zeros)
  let next = 0;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] === 0 && next > 0) arr[i] = next;
    else if (arr[i] > 0) next = arr[i];
  }
  // If still all zeros, set to 1
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] === 0) arr[i] = 1;
  }
}

/**
 * Build cumulative coordinate arrays from cell dimensions.
 *
 * @param {{ rowIndex: number, colIndex: number, rowSpan: number, colSpan: number, width: number, height: number }[]} cells
 * @returns {{ colX: number[], rowY: number[], totalWidth: number, totalHeight: number }}
 */
function buildGrid(cells) {
  let maxRow = 0;
  let maxCol = 0;
  for (const c of cells) {
    maxRow = Math.max(maxRow, c.rowIndex + c.rowSpan);
    maxCol = Math.max(maxCol, c.colIndex + c.colSpan);
  }

  // Column widths from colSpan=1 cells (most precise)
  const colWidths = new Array(maxCol).fill(0);
  for (const c of cells) {
    if (c.colSpan === 1 && c.width > 0) {
      colWidths[c.colIndex] = Math.max(colWidths[c.colIndex], c.width);
    }
  }

  // Fill gaps using spanning cells
  for (const c of cells) {
    if (c.colSpan > 1 && c.width > 0) {
      const perCol = c.width / c.colSpan;
      let anyMissing = false;
      for (let i = c.colIndex; i < c.colIndex + c.colSpan; i++) {
        if (colWidths[i] === 0) anyMissing = true;
      }
      if (anyMissing) {
        for (let i = c.colIndex; i < c.colIndex + c.colSpan; i++) {
          if (colWidths[i] === 0) colWidths[i] = perCol;
        }
      }
    }
  }

  fillZeros(colWidths);

  // Row heights from rowSpan=1 cells
  const rowHeights = new Array(maxRow).fill(0);
  for (const c of cells) {
    if (c.rowSpan === 1 && c.height > 0) {
      rowHeights[c.rowIndex] = Math.max(rowHeights[c.rowIndex], c.height);
    }
  }

  // Fill gaps using spanning cells
  for (const c of cells) {
    if (c.rowSpan > 1 && c.height > 0) {
      const perRow = c.height / c.rowSpan;
      let anyMissing = false;
      for (let i = c.rowIndex; i < c.rowIndex + c.rowSpan; i++) {
        if (rowHeights[i] === 0) anyMissing = true;
      }
      if (anyMissing) {
        for (let i = c.rowIndex; i < c.rowIndex + c.rowSpan; i++) {
          if (rowHeights[i] === 0) rowHeights[i] = perRow;
        }
      }
    }
  }

  fillZeros(rowHeights);

  // Build cumulative arrays
  const colX = [0];
  for (let i = 0; i < maxCol; i++) colX.push(colX[colX.length - 1] + colWidths[i]);

  const rowY = [0];
  for (let i = 0; i < maxRow; i++) rowY.push(rowY[rowY.length - 1] + rowHeights[i]);

  return {
    colX,
    rowY,
    totalWidth: colX[colX.length - 1],
    totalHeight: rowY[rowY.length - 1],
  };
}

/**
 * Convert a cell's grid position to a normalized [0,1] polygon ring.
 * Clockwise winding: top-left → top-right → bottom-right → bottom-left → close.
 *
 * @param {number[]} colX
 * @param {number[]} rowY
 * @param {number} totalWidth
 * @param {number} totalHeight
 * @param {object} cell
 * @returns {number[][][]}
 */
function cellToPolygon(colX, rowY, totalWidth, totalHeight, cell) {
  const x1 = colX[cell.colIndex] / totalWidth;
  const x2 = colX[cell.colIndex + cell.colSpan] / totalWidth;
  const y1 = rowY[cell.rowIndex] / totalHeight;
  const y2 = rowY[cell.rowIndex + cell.rowSpan] / totalHeight;

  return [[
    [x1, y1],
    [x2, y1],
    [x2, y2],
    [x1, y2],
    [x1, y1],
  ]];
}

// ---------------------------------------------------------------------------
// Category classification
// ---------------------------------------------------------------------------

/**
 * Classify a cell into a GeoJSON feature category based on its text.
 * @param {string} text
 * @returns {string}
 */
function classifyCategory(text) {
  if (!text || text.trim() === "") return "structural";

  const t = text.trim();

  // "X" markers — areas that exist in the HWPX but aren't accessible
  if (t === "X" || t === "x") return "unknown";

  if (t.includes("계단")) return "stair";
  if (t === "E.V" || t.includes("엘리베이터") || t.includes("승강기")) return "elevator";
  if (t.includes("화장실") || t === "WC" || /^W\.?C$/i.test(t)) return "restroom";
  if (t.includes("복도") || t.includes("통로") || t.toLowerCase().includes("corridor") || t.includes("로비") || t.includes("홀")) return "corridor";
  if (t.includes("주차")) return "parking";
  if (t.includes("샤워") || t.includes("목욕")) return "facility";
  if (t.includes("급식") || t.includes("식당") || t.includes("식생활") || t.includes("식") || t.includes("주방") || t.includes("매점")) return "facility";
  if (t.includes("운동장") || t.includes("체육") || t.includes("운동")) return "outdoor";

  // Classrooms: contains "실" with learning-related keywords
  if (t.includes("실") && (
    t.includes("교") || t.includes("학습") || t.includes("실습") ||
    t.includes("프로그래밍") || t.includes("개발") || t.includes("연구") ||
    t.includes("과학") || t.includes("음악") || t.includes("미술") ||
    t.includes("컴퓨터") || t.includes("실") // catch-all for anything-sil
  )) return "classroom";

  // Office: contains "실" with admin/work keywords
  if (t.includes("실") && (
    t.includes("교무") || t.includes("행정") || t.includes("회의") ||
    t.includes("자치") || t.includes("지원") || t.includes("준비") ||
    t.includes("자료") || t.includes("문서") || t.includes("대기") ||
    t.includes("상담") || t.includes("관리") || t.includes("방송") ||
    t.includes("스튜디오") || t.includes("휴게") || t.includes("생활") ||
    t.includes("지도") || t.includes("전산") || t.includes("성적")
  )) return "office";

  // Remaining "실" words
  if (t.includes("실")) return "classroom";

  // Rooms with specific naming patterns
  if (t.includes("베르") || t.includes("BSSM") || t.includes("GYM")) return "room";
  if (/^\d+-\d+$/.test(t)) return "classroom"; // e.g., "1-1", "2-3"
  if (t.includes("카페") || t.includes("까페")) return "facility";

  return "room";
}

// ---------------------------------------------------------------------------
// Split text merging
// ---------------------------------------------------------------------------

/**
 * Check if two features are horizontally adjacent (share the same row).
 */
function isAdjacentHorizontal(a, b) {
  const aCoords = a.geometry.coordinates[0];
  const bCoords = b.geometry.coordinates[0];

  // Same top y
  if (Math.abs(aCoords[0][1] - bCoords[0][1]) > 0.005) return false;
  // Same bottom y
  if (Math.abs(aCoords[2][1] - bCoords[2][1]) > 0.005) return false;
  // A's right edge is at B's left edge
  if (Math.abs(aCoords[1][0] - bCoords[0][0]) > 0.005) return false;

  return true;
}

/**
 * Attempt to merge adjacent single-character cells into combined features.
 * Many Korean room names are split across cells (e.g., 게+스+트+룸 → 게스트룸).
 *
 * @param {object[]} features
 * @returns {object[]}
 */
function mergeSplitText(features) {
  if (features.length < 2) return features;

  const merged = [];
  const used = new Array(features.length).fill(false);

  // Build groups of horizontally adjacent single-character cells
  const groups = [];
  for (let i = 0; i < features.length; i++) {
    if (used[i]) continue;

    const text = features[i].properties.name_ko;
    if ([...text].length !== 1) continue;
    if (!isKorean(text)) continue;

    const group = [i];
    used[i] = true;

    // Look rightward for adjacent single-char cells
    let changed = true;
    while (changed) {
      changed = false;
      for (const idx of [...group]) {
        for (let j = 0; j < features.length; j++) {
          if (used[j]) continue;
          const jText = features[j].properties.name_ko;
          if ([...jText].length !== 1) continue;
          if (!isKorean(jText)) continue;

          if (isAdjacentHorizontal(features[idx], features[j]) ||
              isAdjacentHorizontal(features[j], features[idx])) {
            used[j] = true;
            group.push(j);
            changed = true;
          }
        }
      }
    }

    if (group.length > 1) {
      // Sort by x position (left to right)
      group.sort((a, b) =>
        features[a].geometry.coordinates[0][0][0] - features[b].geometry.coordinates[0][0][0]
      );
      groups.push(group);
    } else {
      used[i] = false; // Release single-char cells not in a group
    }
  }

  // Create merged features for each group
  for (const group of groups) {
    const first = features[group[0]];
    const last = features[group[group.length - 1]];
    const combinedText = group.map(i => features[i].properties.name_ko).join("");

    const x1 = first.geometry.coordinates[0][0][0];
    const y1 = first.geometry.coordinates[0][0][1];
    const x2 = last.geometry.coordinates[0][1][0];
    const y2 = first.geometry.coordinates[0][2][1];

    merged.push({
      type: "Feature",
      id: first.id,
      geometry: {
        type: "Polygon",
        coordinates: [[
          [x1, y1],
          [x2, y1],
          [x2, y2],
          [x1, y2],
          [x1, y1],
        ]],
      },
      properties: {
        ...first.properties,
        name_ko: combinedText,
        name: combinedText,
        category: classifyCategory(combinedText),
      },
    });
  }

  // Add remaining features (non-single-char, or single-char not in any group)
  for (let i = 0; i < features.length; i++) {
    if (used[i]) continue;
    merged.push(features[i]);
    used[i] = true;
  }

  return merged;
}

/**
 * Check if a string contains at least one Korean character.
 */
function isKorean(str) {
  return /[\uAC00-\uD7AF]/.test(str);
}

// ---------------------------------------------------------------------------
// Building outline detection
// ---------------------------------------------------------------------------

/**
 * Compute the approximate outer boundary for a group of structural (thick-border) cells.
 * Uses a conservative bounding-box approach per connected component.
 *
 * @param {object[]} features  array of structural features on a single level
 * @returns {object[]} building outline descriptors
 */
function detectBuildingOutlines(structuralFeatures, levelId) {
  if (structuralFeatures.length === 0) return [];

  const outlines = [];
  const visited = new Array(structuralFeatures.length).fill(false);

  for (let i = 0; i < structuralFeatures.length; i++) {
    if (visited[i]) continue;

    // BFS for connected component
    const component = [];
    const queue = [i];
    visited[i] = true;

    while (queue.length > 0) {
      const idx = queue.shift();
      component.push(structuralFeatures[idx]);

      const aPoly = structuralFeatures[idx].geometry.coordinates[0];
      // Center of current cell
      const ax = (aPoly[0][0] + aPoly[1][0]) / 2;
      const ay = (aPoly[0][1] + aPoly[2][1]) / 2;

      for (let j = 0; j < structuralFeatures.length; j++) {
        if (visited[j]) continue;
        const bPoly = structuralFeatures[j].geometry.coordinates[0];
        const bx = (bPoly[0][0] + bPoly[1][0]) / 2;
        const by = (bPoly[0][1] + bPoly[2][1]) / 2;

        // Check adjacency: share an edge (distance very small between edges)
        const dx = Math.abs(ax - bx);
        const dy = Math.abs(ay - by);
        const isAdjacent = dx < 0.02 || dy < 0.02;

        // Also check if rectangles touch
        const aRight = aPoly[1][0];
        const aLeft = aPoly[0][0];
        const aBottom = aPoly[2][1];
        const aTop = aPoly[0][1];

        const bRight = bPoly[1][0];
        const bLeft = bPoly[0][0];
        const bBottom = bPoly[2][1];
        const bTop = bPoly[0][1];

        const xOverlap = aLeft < bRight && aRight > bLeft;
        const yOverlap = aTop < bBottom && aBottom > bTop;
        const xTouching = Math.abs(aLeft - bRight) < 0.005 || Math.abs(aRight - bLeft) < 0.005;
        const yTouching = Math.abs(aTop - bBottom) < 0.005 || Math.abs(aBottom - bTop) < 0.005;

        const touches = (xOverlap && yTouching) || (yOverlap && xTouching);

        if (touches) {
          visited[j] = true;
          queue.push(j);
        }
      }
    }

    if (component.length >= 2) {
      // Compute bounding box
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const feat of component) {
        for (const coord of feat.geometry.coordinates[0]) {
          minX = Math.min(minX, coord[0]);
          minY = Math.min(minY, coord[1]);
          maxX = Math.max(maxX, coord[0]);
          maxY = Math.max(maxY, coord[1]);
        }
      }

      outlines.push({
        building_id: "campus-main",
        level_id: levelId,
        vertices: [
          [minX, minY],
          [maxX, minY],
          [maxX, maxY],
          [minX, maxY],
        ],
        vertexLabels: ["A", "B", "C", "D"],
      });
    }
  }

  return outlines;
}

// ---------------------------------------------------------------------------
// Main conversion
// ---------------------------------------------------------------------------

/**
 * Convert extracted HWPX data to a CampusFeatureCollection.
 *
 * @param {object} inputData  parsed JSON from extract-hwpx.mjs
 * @returns {{ featureCollection: object, buildingOutlines: object[] }}
 */
export function convertToGeoJson(inputData) {
  const allFeatures = [];
  const allOutlines = [];

  if (!inputData.tables || !Array.isArray(inputData.tables)) {
    return {
      featureCollection: {
        type: "FeatureCollection",
        features: [],
        metadata: { coordinateSystem: "local", units: "source-normalized" },
      },
      buildingOutlines: [],
    };
  }

  for (const table of inputData.tables) {
    if (table.role !== "level") continue;

    const levelId = table.levelId;
    const grid = buildGrid(table.cells);

    /** @type {object[]} */
    const levelFeatures = [];

    for (const cell of table.cells) {
      const hasText = cell.text && cell.text.trim().length > 0;
      const hasThickBorder = cell.borderFillId != null && THICK_BORDER_IDS.has(cell.borderFillId);
      const isXPattern = cell.borderFillId != null && X_PATTERN_IDS.has(cell.borderFillId);
      const isEmptyThinBorder = !hasText && !hasThickBorder && !isXPattern;

      // Drop empty thin-bordered cells (hatched background cells with no content)
      if (isEmptyThinBorder) continue;

      const polygon = cellToPolygon(grid.colX, grid.rowY, grid.totalWidth, grid.totalHeight, cell);

      let category;
      if (isXPattern) {
        // X-marked cells are inaccessible areas regardless of text content
        category = "unknown";
      } else if (hasText) {
        category = classifyCategory(cell.text);
      } else if (hasThickBorder) {
        category = "structural";
      } else {
        category = "unknown";
      }

      const name_ko = (cell.text || "").trim();
      const level = parseInt(levelId, 10);

      const feature = {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: polygon,
        },
        properties: {
          name: name_ko,
          name_ko,
          level,
          level_id: levelId,
          building_id: "campus-main",
          category,
          interactive: !["structural", "unknown", "stair", "restroom", "elevator", "corridor"].includes(category),
          source: inputData.source,
        },
      };
      feature.id = `${levelId}-${cell.rowIndex}-${cell.colIndex}`;

      levelFeatures.push(feature);
    }

    // Merge split text
    const merged = mergeSplitText(levelFeatures);
    allFeatures.push(...merged);

    // Detect building outlines from thick-bordered cells
    const structural = merged.filter(f => f.properties.category === "structural");
    const outlines = detectBuildingOutlines(structural, levelId);
    allOutlines.push(...outlines);
  }

  // Regenerate stable IDs after merging
  let featureIdx = 0;
  const finalFeatures = allFeatures.map(f => {
    featureIdx++;
    return {
      ...f,
      id: f.id || `feature-${featureIdx}`,
    };
  });

  const featureCollection = {
    type: "FeatureCollection",
    features: finalFeatures,
    metadata: {
      coordinateSystem: "local",
      units: "source-normalized",
    },
  };

  return { featureCollection, buildingOutlines: allOutlines };
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

function main() {
  const { input, output } = parseArgs();

  let inputData;
  try {
    const raw = readFileSync(input, "utf-8");
    inputData = JSON.parse(raw);
  } catch (e) {
    console.error("Error: invalid JSON input — " + e.message);
    process.exit(1);
  }

  if (!inputData.tables || !Array.isArray(inputData.tables)) {
    console.error("Error: input must have a 'tables' array");
    process.exit(1);
  }

  const result = convertToGeoJson(inputData);

  // Combine feature collection with building outlines
  const outputObj = {
    ...result.featureCollection,
    buildingOutlines: result.buildingOutlines,
  };

  const json = JSON.stringify(outputObj, null, 2);

  if (output) {
    writeFileSync(output, json, "utf-8");
    console.error(
      `Wrote ${result.featureCollection.features.length} features ` +
      `(+ ${result.buildingOutlines.length} building outline(s)) to ${output}`
    );
  } else {
    console.log(json);
  }
}

const isMain =
  process.argv[1] &&
  (import.meta.url === `file://${process.argv[1]}` ||
    import.meta.url.endsWith(process.argv[1].split("/").pop() || ""));

if (isMain) {
  main();
}
