export { FloorMap } from "./components/FloorMap";
export { CampusMap } from "./components/CampusMap";
export { bssmFloorMap } from "./data/bssm";
export {
  geojsonToFloorMapData,
  bssmFloorMapFromGeojson,
} from "./data/geojsonToFloorMap";
export type {
  FloorElement,
  Floor,
  FloorMapData,
  FloorMapProps,
} from "./types";

export type { CampusMapProps } from "./components/CampusMap";

export type {
  CampusFeatureCollection,
  CampusFeature,
  CampusFeatureProperties,
  CampusFeatureCategory,
  ControlPoint,
  GeoreferenceMetadata,
} from "./schemas/campusGeojson";

export type {
  CampusWgs84FeatureCollection,
  CampusWgs84Feature,
  CampusWgs84FeatureProperties,
} from "./schemas/campusWgs84Geojson";

export type {
  OverlayLngLat,
  OverlaySelectionContext,
  OverlayCategoryStyle,
  CampusOverlayBaseProps,
} from "./overlays/types";

export {
  filterFeaturesByLevel,
  getAvailableLevels,
  getFeatureLngLat,
  getFeatureBounds,
  DEFAULT_CATEGORY_STYLES,
} from "./overlays/shared";