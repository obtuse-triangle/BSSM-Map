import campusWgs84Data from "./campus-wgs84.json";
import type { CampusWgs84FeatureCollection } from "../schemas/campusWgs84Geojson";

export const campusWgs84FeatureCollection: CampusWgs84FeatureCollection =
  campusWgs84Data as unknown as CampusWgs84FeatureCollection;
