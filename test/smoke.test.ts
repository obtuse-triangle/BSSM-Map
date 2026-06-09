import { describe, expect, it } from "vitest";
import validFeatureCollection from "./fixtures/valid-feature-collection.json";
import invalidMissingType from "./fixtures/invalid-missing-type.json";
import { validateGeoJson } from "./helpers/validate-geojson";

describe("smoke", () => {
  it("vitest runs basic assertions", () => {
    expect(1 + 1).toBe(2);
  });
});

describe("validateGeoJson", () => {
  it("accepts a valid FeatureCollection", () => {
    const result = validateGeoJson(validFeatureCollection);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("FeatureCollection");
      expect(result.data.features).toHaveLength(1);
    }
  });

  it("rejects an object missing the type field", () => {
    const result = validateGeoJson(invalidMissingType);
    expect(result.success).toBe(false);
  });

  it("rejects null", () => {
    const result = validateGeoJson(null);
    expect(result.success).toBe(false);
  });

  it("rejects a plain object without features array", () => {
    const result = validateGeoJson({ type: "FeatureCollection" });
    expect(result.success).toBe(false);
  });
});
