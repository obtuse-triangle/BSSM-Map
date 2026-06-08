import type { CSSProperties } from "react";
import type { CampusFeatureCategory } from "../schemas/campusGeojson";
import type {
  CampusWgs84Feature,
  CampusWgs84FeatureCollection,
} from "../schemas/campusWgs84Geojson";

// ─── LngLat primitive ───────────────────────────────────────────

export type OverlayLngLat = [lng: number, lat: number];

// ─── Selection context passed to onFeatureSelect ────────────────

export interface OverlaySelectionContext {
  levelId: string;
  lngLat: OverlayLngLat;
  adapter: "maplibre" | "leaflet";
  sourceEvent?: unknown;
}

// ─── Per-category style definition ──────────────────────────────

export interface OverlayCategoryStyle {
  fillColor: string;
  fillOpacity?: number;
  strokeColor?: string;
  strokeWidth?: number;
}

// ─── Base props for any overlay component ───────────────────────

export interface CampusOverlayBaseProps {
  data: CampusWgs84FeatureCollection;
  initialLevel?: string | number;
  selectedLevel?: string;
  onLevelChange?: (levelId: string) => void;
  onFeatureSelect?: (
    feature: CampusWgs84Feature,
    context: OverlaySelectionContext,
  ) => void;
  className?: string;
  style?: CSSProperties;
  showLevelSelector?: boolean;
  showLegend?: boolean;
  categoryStyles?: Partial<
    Record<CampusFeatureCategory, OverlayCategoryStyle>
  >;
}
