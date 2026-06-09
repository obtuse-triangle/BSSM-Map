import { beforeAll, describe, expect, it } from "vitest";
import { extractTablesFromXml } from "../../scripts/extract-hwpx.mjs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const HWPX_PATH = resolve("org_data/학교배치도(창고위치).hwpx");

/**
 * Extract Contents/section0.xml from the HWPX ZIP.
 */
function readHwpxXml(): string {
  return execSync("unzip -p -- " + JSON.stringify(HWPX_PATH) + " Contents/section0.xml", {
    encoding: "utf-8",
    maxBuffer: 50 * 1024 * 1024,
  });
}

/** Regex matching any Hangul syllable, jamo, or compatibility jamo. */
const KOREAN_RE = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;

describe("extract-hwpx", () => {
  let result: ReturnType<typeof extractTablesFromXml>;

  beforeAll(() => {
    const xml = readHwpxXml();
    result = extractTablesFromXml(xml, "학교배치도(창고위치).hwpx");
  });

  it("produces exactly 5 table summaries", () => {
    expect(result.tables).toHaveLength(5);
  });

  it("names the source correctly", () => {
    expect(result.source).toBe("학교배치도(창고위치).hwpx");
  });

  describe("legend table (index 0)", () => {
    it("has role 'legend'", () => {
      expect(result.tables[0].role).toBe("legend");
    });

    it("has no levelId", () => {
      expect(result.tables[0]).not.toHaveProperty("levelId");
    });

    it("has positive row and column counts", () => {
      expect(result.tables[0].rowCount).toBeGreaterThan(0);
      expect(result.tables[0].colCount).toBeGreaterThan(0);
    });

    it("has cells", () => {
      expect(result.tables[0].cells.length).toBeGreaterThan(0);
    });
  });

  describe.each([1, 2, 3, 4])("level %i table", (levelIndex) => {
    const table = () => result.tables[levelIndex];

    it(`has role 'level'`, () => {
      expect(table().role).toBe("level");
    });

    it(`has levelId '${levelIndex}'`, () => {
      expect(table().levelId).toBe(String(levelIndex));
    });

    it("has positive row and column counts", () => {
      expect(table().rowCount).toBeGreaterThan(0);
      expect(table().colCount).toBeGreaterThan(0);
    });

    it("has cells with text records", () => {
      const cellsWithText = table().cells.filter((c) => c.text.length > 0);
      expect(cellsWithText.length).toBeGreaterThan(0);
    });

    it("contains Korean labels (not mojibake)", () => {
      const allText = table().cells.map((c) => c.text).join(" ");
      expect(allText).toMatch(KOREAN_RE);
    });

    it("has valid cell positions", () => {
      for (const cell of table().cells) {
        expect(cell.rowIndex).toBeGreaterThanOrEqual(0);
        expect(cell.colIndex).toBeGreaterThanOrEqual(0);
        expect(cell.rowSpan).toBeGreaterThanOrEqual(1);
        expect(cell.colSpan).toBeGreaterThanOrEqual(1);
      }
    });
  });

  it("all tables have unique roles/levelIds", () => {
    const roles = result.tables.map((t) => t.role + (t.levelId ?? ""));
    expect(new Set(roles).size).toBe(roles.length);
  });
});
