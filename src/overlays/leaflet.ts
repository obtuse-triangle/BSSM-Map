// Leaflet overlay subpath entry — component exports added in Task 4
export type {
  OverlayLngLat,
  OverlaySelectionContext,
  OverlayCategoryStyle,
  CampusOverlayBaseProps,
} from "./types";
export {
  filterFeaturesByLevel,
  getAvailableLevels,
  getFeatureLngLat,
  getFeatureBounds,
  DEFAULT_CATEGORY_STYLES,
} from "./shared";
export type {
  CampusWgs84FeatureCollection,
  CampusWgs84Feature,
  CampusWgs84FeatureProperties,
} from "../schemas/campusWgs84Geojson";
