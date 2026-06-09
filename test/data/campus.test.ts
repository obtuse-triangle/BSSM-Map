import { describe, expect, it } from "vitest";
import { campusFeatureCollection } from "../../src/data/campus";
import type { CampusFeatureCollection } from "../../src/data/campus";

describe("campus data entry point", () => {
  it("exports a valid CampusFeatureCollection", () => {
    expect(campusFeatureCollection).toBeDefined();
    expect(campusFeatureCollection.type).toBe("FeatureCollection");
    expect(Array.isArray(campusFeatureCollection.features)).toBe(true);
    expect(campusFeatureCollection.features.length).toBeGreaterThan(0);
    expect(campusFeatureCollection.metadata.coordinateSystem).toBe("local");
    expect(campusFeatureCollection.metadata.units).toBe("source-normalized");
  });

  it("has features with required properties", () => {
    for (const feature of campusFeatureCollection.features) {
      expect(feature.type).toBe("Feature");
      expect(feature.geometry.type).toBe("Polygon");
      expect(feature.properties.name).toBeDefined();
      expect(feature.properties.name_ko).toBeDefined();
      expect(typeof feature.properties.level).toBe("number");
      expect(feature.properties.level_id).toBeDefined();
      expect(feature.properties.building_id).toBe("campus-main");
      expect(feature.properties.category).toBeDefined();
      expect(typeof feature.properties.interactive).toBe("boolean");
    }
  });

  it("type import is valid", () => {
    // Type-only check: verify CampusFeatureCollection is a usable type
    const checkType: CampusFeatureCollection = campusFeatureCollection;
    expect(checkType).toBeDefined();
  });
});
