export { MapLibreCampusOverlay } from "./maplibre/MapLibreCampusOverlay";
export type { MapLibreCampusOverlayProps } from "./maplibre/MapLibreCampusOverlay";

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
