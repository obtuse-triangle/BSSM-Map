import {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
  type CSSProperties,
} from "react";
import maplibregl from "maplibre-gl";
import type { CampusOverlayBaseProps } from "../types";
import type { CampusWgs84Feature } from "../../schemas/campusWgs84Geojson";
import type { SchoolOutlineFeatureCollection } from "../../data/school-outline";
import {
  filterFeaturesByLevel,
  getAvailableLevels,
  getFeatureBounds,
  DEFAULT_CATEGORY_STYLES,
} from "../shared";
import type { CampusFeatureCategory } from "../../schemas/campusGeojson";
import type { OverlayCategoryStyle } from "../types";

// ─── Props ─────────────────────────────────────────────────────────

export interface MapLibreCampusOverlayProps extends CampusOverlayBaseProps {
  mapOptions?: Omit<maplibregl.MapOptions, "container">;
  rasterStyle?: "osm" | "none";
  selectedRoomName?: string | null;
  schoolOutline?: SchoolOutlineFeatureCollection;
}

// ─── Styles ───────────────────────────────────────────────────────

const containerStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  minHeight: 200,
};

const levelSelectorStyle: CSSProperties = {
  position: "absolute",
  top: 8,
  left: 8,
  zIndex: 1,
  display: "flex",
  gap: 4,
};

const levelButtonStyle = (active: boolean): CSSProperties => ({
  padding: "4px 10px",
  border: "1px solid #d1d5db",
  borderRadius: 4,
  backgroundColor: active ? "#2563eb" : "#ffffff",
  color: active ? "#ffffff" : "#374151",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 500,
  fontFamily: "system-ui, sans-serif",
});

// ─── OSM raster style ────────────────────────────────────────────

const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "&copy; OpenStreetMap contributors",
    },
  },
  layers: [
    {
      id: "osm-raster",
      type: "raster",
      source: "osm",
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

const EMPTY_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {},
  layers: [],
};

// ─── Component ─────────────────────────────────────────────────────

export function MapLibreCampusOverlay({
  data,
  initialLevel,
  selectedLevel,
  onLevelChange,
  onFeatureSelect,
  className,
  style,
  showLevelSelector = true,
  showLegend = true,
  categoryStyles,
  mapOptions,
  rasterStyle = "osm",
  selectedRoomName = null,
  schoolOutline,
}: MapLibreCampusOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const featuresRef = useRef<CampusWgs84Feature[]>([]);
  const currentLevelRef = useRef<string>("");

  // ── Level state: controlled vs uncontrolled ──
  const levels = useMemo(() => getAvailableLevels(data), [data]);

  const [internalLevel, setInternalLevel] = useState<string>(() => {
    if (initialLevel !== undefined) return String(initialLevel);
    return levels[0] ?? "";
  });

  const isControlled = selectedLevel !== undefined;
  const currentLevel = isControlled ? selectedLevel : internalLevel;

  // ── Merged category styles ──
  const mergedStyles = useMemo(
    () => ({ ...DEFAULT_CATEGORY_STYLES, ...categoryStyles }),
    [categoryStyles],
  );

  // ── Filtered features for current level ──
  const levelFeatures = useMemo(
    () => filterFeaturesByLevel(data, currentLevel),
    [data, currentLevel],
  );

  // ── Initialize map ──
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: rasterStyle === "osm" ? OSM_STYLE : EMPTY_STYLE,
      ...mapOptions,
    });

    mapRef.current = map;

    map.on("load", () => {
      const level = currentLevelRef.current || currentLevel;
      const features = filterFeaturesByLevel(data, level);
      featuresRef.current = features;

      if (schoolOutline) {
        map.addSource("school-outline", {
          type: "geojson",
          data: schoolOutline,
        });
        map.addLayer({
          id: "school-outline-fill",
          type: "fill",
          source: "school-outline",
          paint: {
            "fill-color":
              "#e2e8f0" as maplibregl.DataDrivenPropertyValueSpecification<string>,
            "fill-opacity":
              0.1 as maplibregl.DataDrivenPropertyValueSpecification<number>,
          },
        });
        map.addLayer({
          id: "school-outline-line",
          type: "line",
          source: "school-outline",
          paint: {
            "line-color":
              "#0f172a" as maplibregl.DataDrivenPropertyValueSpecification<string>,
            "line-width":
              3 as maplibregl.DataDrivenPropertyValueSpecification<number>,
          },
        });
      }

      // Add GeoJSON source
      map.addSource("campus", {
        type: "geojson",
        data: { type: "FeatureCollection", features },
      });

      // Build data-driven fill-color expression from category styles
      const fillColorExpr: unknown[] = [
        "match",
        ["get", "category"],
      ];
      const fillOutlineExpr: unknown[] = [
        "match",
        ["get", "category"],
      ];
      for (const [cat, s] of Object.entries(mergedStyles)) {
        fillColorExpr.push(cat, s.fillColor);
        fillOutlineExpr.push(
          cat,
          s.strokeColor ?? s.fillColor,
        );
      }
      fillColorExpr.push("#eeeeee");
      fillOutlineExpr.push("#9e9e9e");

      // Structural outline layer (before fill so rooms draw on top)
      map.addLayer({
        id: "campus-outline-line",
        type: "line",
        source: "campus",
        filter: ["==", ["get", "category"], "structural"],
        paint: {
          "line-color":
            "#1f2937" as maplibregl.DataDrivenPropertyValueSpecification<string>,
          "line-width":
            3 as maplibregl.DataDrivenPropertyValueSpecification<number>,
        },
      });

      // Fill layer
      map.addLayer({
        id: "campus-fill",
        type: "fill",
        source: "campus",
        paint: {
          "fill-color": fillColorExpr as maplibregl.DataDrivenPropertyValueSpecification<string>,
          "fill-opacity":
            0.5 as maplibregl.DataDrivenPropertyValueSpecification<number>,
          "fill-outline-color": fillOutlineExpr as maplibregl.DataDrivenPropertyValueSpecification<string>,
        },
      });

      // Line (outline) layer
      map.addLayer({
        id: "campus-outline",
        type: "line",
        source: "campus",
        paint: {
          "line-color":
            "#555555" as maplibregl.DataDrivenPropertyValueSpecification<string>,
          "line-width":
            1 as maplibregl.DataDrivenPropertyValueSpecification<number>,
        },
      });

      // Selected room fill highlight (semi-transparent blue overlay)
      map.addLayer({
        id: "campus-selected-fill",
        type: "fill",
        source: "campus",
        filter: ["==", ["get", "name"], selectedRoomName ?? ""],
        paint: {
          "fill-color":
            "#3b82f6" as maplibregl.DataDrivenPropertyValueSpecification<string>,
          "fill-opacity":
            0.18 as maplibregl.DataDrivenPropertyValueSpecification<number>,
        },
      });

      // Selected room outline highlight (thick blue border)
      map.addLayer({
        id: "campus-selected-line",
        type: "line",
        source: "campus",
        filter: ["==", ["get", "name"], selectedRoomName ?? ""],
        paint: {
          "line-color":
            "#2563eb" as maplibregl.DataDrivenPropertyValueSpecification<string>,
          "line-width":
            4 as maplibregl.DataDrivenPropertyValueSpecification<number>,
          "line-opacity":
            0.95 as maplibregl.DataDrivenPropertyValueSpecification<number>,
        },
      });

      // Symbol layer for room name labels
      map.addLayer({
        id: "campus-label",
        type: "symbol",
        source: "campus",
        filter: [
          "all",
          ["==", ["get", "interactive"], true],
          ["in", ["get", "category"], ["literal", ["room", "classroom", "office", "facility"]]],
        ],
        layout: {
          "text-field": ["coalesce", ["get", "name_ko"], ["get", "name"]] as unknown as maplibregl.DataDrivenPropertyValueSpecification<string>,
          "text-font": ["Open Sans Regular"],
          "text-size": 11,
          "text-padding": 4,
          "text-allow-overlap": false,
          "text-ignore-placement": false,
        },
        paint: {
          "text-color":
            "#0f172a" as maplibregl.DataDrivenPropertyValueSpecification<string>,
          "text-halo-color":
            "#ffffff" as maplibregl.DataDrivenPropertyValueSpecification<string>,
          "text-halo-width":
            1.5 as maplibregl.DataDrivenPropertyValueSpecification<number>,
        },
      });

      // Fit bounds to features
      if (features.length > 0) {
        const bounds = getFeatureBounds(features);
        map.fitBounds(
          [
            [bounds.west, bounds.south],
            [bounds.east, bounds.north],
          ],
          { padding: 40 },
        );
      }
    });

    // Click handler on campus-fill layer
    map.on(
      "click",
      "campus-fill",
      (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        if (!e.features || e.features.length === 0) return;
        const mapFeature = e.features[0];
        // Find matching CampusWgs84Feature from our data
        const feature = featuresRef.current.find(
          (f) => f.properties.name === (mapFeature.properties as Record<string, unknown>).name,
        ) ?? featuresRef.current[0];
        if (!feature) return;

        onFeatureSelect?.(feature, {
          levelId: currentLevelRef.current,
          lngLat: [e.lngLat.lng, e.lngLat.lat],
          adapter: "maplibre",
          sourceEvent: e,
        });
      },
    );

    // Cursor feedback
    map.on("mouseenter", "campus-fill", () => {
      const canvas = map.getCanvas();
      canvas.style.cursor = "pointer";
    });
    map.on("mouseleave", "campus-fill", () => {
      const canvas = map.getCanvas();
      canvas.style.cursor = "";
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Only initialize map once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Update source data when level changes ──
  useEffect(() => {
    currentLevelRef.current = currentLevel;
    featuresRef.current = levelFeatures;

    const map = mapRef.current;
    if (!map) return;

    // Check if source exists (map may not be loaded yet in race condition)
    const source = map.getSource("campus") as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData({ type: "FeatureCollection", features: levelFeatures });
    }

    // Fit bounds when level changes
    if (levelFeatures.length > 0) {
      const bounds = getFeatureBounds(levelFeatures);
      map.fitBounds(
        [
          [bounds.west, bounds.south],
          [bounds.east, bounds.north],
        ],
        { padding: 40 },
      );
    }
  }, [currentLevel, levelFeatures]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const filter = selectedRoomName
      ? (["==", ["get", "name"], selectedRoomName] as never)
      : (["==", ["get", "name"], ""] as never);

    try {
      map.setFilter("campus-selected-fill", filter);
      map.setFilter("campus-selected-line", filter);
    } catch {
      // layers not yet added — will be set on initial load
    }
  }, [selectedRoomName]);

  // ── Level change handler ──
  const handleLevelChange = useCallback(
    (levelId: string) => {
      if (isControlled) {
        onLevelChange?.(levelId);
      } else {
        setInternalLevel(levelId);
        onLevelChange?.(levelId);
      }
    },
    [isControlled, onLevelChange],
  );

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ ...containerStyle, ...style }}
    >
      {showLevelSelector && levels.length > 0 && (
        <div style={levelSelectorStyle} data-testid="level-selector">
          {levels.map((level) => (
            <button
              key={level}
              type="button"
              style={levelButtonStyle(level === currentLevel)}
              onClick={() => handleLevelChange(level)}
            >
              {level}F
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
