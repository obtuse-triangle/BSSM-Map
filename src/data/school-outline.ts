import schoolOutlineData from "./school-outline.json";

interface SchoolOutlineFeature {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: {
    type: "MultiPolygon";
    coordinates: number[][][][];
  };
}

export interface SchoolOutlineFeatureCollection {
  type: "FeatureCollection";
  features: SchoolOutlineFeature[];
}

export const schoolOutlineFeatureCollection: SchoolOutlineFeatureCollection =
  schoolOutlineData as unknown as SchoolOutlineFeatureCollection;
