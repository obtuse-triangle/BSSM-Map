#!/usr/bin/env node

/**
 * extract-hwpx.mjs — Extract table data from HWPX (HWPML) files.
 *
 * HWPX is a ZIP-based format. The main content lives in Contents/section0.xml.
 * This script extracts all <hp:tbl> elements from that XML and outputs them
 * as structured JSON.
 *
 * Usage:
 *   node scripts/extract-hwpx.mjs --input <path> [--output <path>]
 *
 * If --output is omitted, the result is written to stdout.
 */

import { existsSync, writeFileSync } from "node:fs";
import { resolve, basename } from "node:path";
import { spawnSync } from "node:child_process";
import { XMLParser } from "fast-xml-parser";

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
// ZIP extraction
// ---------------------------------------------------------------------------

/**
 * Extract Contents/section0.xml from a HWPX ZIP file.
 * @param {string} inputPath
 * @returns {string} XML content as string
 */
function extractXml(inputPath) {
  const result = spawnSync("unzip", ["-p", "--", inputPath, "Contents/section0.xml"], {
    encoding: "utf-8",
    maxBuffer: 50 * 1024 * 1024, // 50 MB
  });

  if (result.error) {
    console.error("Error: failed to extract Contents/section0.xml:", result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    const msg = result.stderr?.trim() || `unzip exited with code ${result.status}`;
    console.error("Error:", msg);
    process.exit(1);
  }

  return result.stdout;
}

// ---------------------------------------------------------------------------
// XML parsing helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a value to an array (treat single objects as arrays).
 * @param {*} val
 * @returns {Array}
 */
function toArray(val) {
  if (val == null) return [];
  return Array.isArray(val) ? val : [val];
}

/**
 * Parse attribute value as integer, defaulting to 0.
 */
function intAttr(attrs, name) {
  if (!attrs) return 0;
  const v = attrs[`@_${name}`];
  return v != null ? parseInt(v, 10) : 0;
}

// ---------------------------------------------------------------------------
// Core extraction
// ---------------------------------------------------------------------------

/**
 * Extract the text content from a single <hp:tc> cell node.
 * @param {object} tc  parsed hp:tc node
 * @returns {string}
 */
function getCellText(tc) {
  const subLists = toArray(tc["hp:subList"]);
  const parts = [];

  for (const sl of subLists) {
    const paragraphs = toArray(sl["hp:p"]);
    for (const p of paragraphs) {
      const runs = toArray(p["hp:run"]);
      for (const run of runs) {
        const tValues = toArray(run["hp:t"]);
        for (const tv of tValues) {
          // fast-xml-parser may return text directly or as #text when attributes exist
          const text = typeof tv === "string" ? tv : tv?.["#text"] ?? "";
          if (text) parts.push(text);
        }
      }
    }
  }

  return parts.join("").trim();
}

/**
 * @typedef {object} CellSummary
 * @property {number} rowIndex
 * @property {number} colIndex
 * @property {number} rowSpan
 * @property {number} colSpan
 * @property {string} text
 * @property {number} [width]
 * @property {number} [height]
 * @property {number} [borderFillId]
 */

/**
 * @typedef {object} TableSummary
 * @property {number} index
 * @property {string} role  "legend" | "level"
 * @property {string} [levelId]
 * @property {number} rowCount
 * @property {number} colCount
 * @property {CellSummary[]} rows
 */

/**
 * Extract all tables from a parsed HWPX document.
 *
 * @param {object} parsed  result of XMLParser.parse()
 * @returns {TableSummary[]}
 */
function extractTablesFromDocument(parsed) {
  /** @type {object[]} raw hp:tbl nodes found in the tree */
  const tblNodes = [];

  (function walk(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    for (const [key, val] of Object.entries(node)) {
      if (key === "hp:tbl") {
        tblNodes.push(val);
      } else {
        walk(val);
      }
    }
  })(parsed);

  return tblNodes.map((tblNode, idx) => extractTable(tblNode, idx));
}

/**
 * Extract a single table from its parsed hp:tbl node.
 * @param {object} tblNode
 * @param {number} index
 * @returns {TableSummary}
 */
function extractTable(tblNode, index) {
  const rows = toArray(tblNode["hp:tr"]);
  /** @type {CellSummary[]} */
  const cells = [];

  for (const tr of rows) {
    const tcs = toArray(tr["hp:tc"]);
    for (const tc of tcs) {
      const cellAddr = tc["hp:cellAddr"] || {};
      const cellSpan = tc["hp:cellSpan"] || {};
      const cellSz = tc["hp:cellSz"] || {};

      const rowIndex = intAttr(cellAddr, "rowAddr");
      const colIndex = intAttr(cellAddr, "colAddr");
      const rowSpan = intAttr(cellSpan, "rowSpan") || 1;
      const colSpan = intAttr(cellSpan, "colSpan") || 1;
      const width = intAttr(cellSz, "width");
      const height = intAttr(cellSz, "height");
      const borderFillId = intAttr(tc, "borderFillIDRef") || undefined;

      const text = getCellText(tc);

      cells.push({ rowIndex, colIndex, rowSpan, colSpan, text, width, height, borderFillId });
    }
  }

  // Determine grid dimensions
  const rowCount =
    cells.reduce((max, c) => Math.max(max, c.rowIndex + c.rowSpan), 0);
  const colCount =
    cells.reduce((max, c) => Math.max(max, c.colIndex + c.colSpan), 0);

  const role = index === 0 ? "legend" : "level";
  const table = { index, role, rowCount, colCount, cells };
  if (index > 0) table.levelId = String(index);

  return table;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read and parse a HWPX file, returning all extracted tables.
 *
 * @param {string} inputPath  path to .hwpx file
 * @returns {{ source: string, tables: TableSummary[] }}
 */
export function extractTablesFromFile(inputPath) {
  const xmlContent = extractXml(inputPath);
  return extractTablesFromXml(xmlContent, inputPath);
}

/**
 * Parse HWPX XML content and extract all tables.
 *
 * @param {string} xmlContent  raw Contents/section0.xml content
 * @param {string} [sourceName]  optional source identifier
 * @returns {{ source: string, tables: TableSummary[] }}
 */
export function extractTablesFromXml(xmlContent, sourceName) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    isArray: (name) =>
      [
        "hp:p",
        "hp:run",
        "hp:tr",
        "hp:tc",
        "hp:t",
        "hp:subList",
        "hp:linesegarray",
      ].includes(name),
  });

  const parsed = parser.parse(xmlContent);
  const tables = extractTablesFromDocument(parsed);

  return {
    source: sourceName ? basename(sourceName) : "unknown",
    tables,
  };
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

function main() {
  const { input, output } = parseArgs();
  const result = extractTablesFromFile(input);
  const json = JSON.stringify(result, null, 2);

  if (output) {
    writeFileSync(output, json, "utf-8");
    console.error(`Wrote ${result.tables.length} table(s) to ${output}`);
  } else {
    console.log(json);
  }
}

// Detect if running as main script
const isMain =
  process.argv[1] &&
  (import.meta.url === `file://${process.argv[1]}` ||
    import.meta.url.endsWith(process.argv[1].split("/").pop() || ""));

if (isMain) {
  main();
}
