import campusData from "./campus.json";
import type { CampusFeatureCollection } from "../schemas/campusGeojson";

export const campusFeatureCollection: CampusFeatureCollection = campusData as unknown as CampusFeatureCollection;

export type { CampusFeatureCollection } from "../schemas/campusGeojson";
