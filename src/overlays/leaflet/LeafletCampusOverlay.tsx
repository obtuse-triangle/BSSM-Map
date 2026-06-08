import {
  useState,
  useRef,
  useMemo,
  useEffect,
  useCallback,
} from "react";
import L from "leaflet";
import type { CampusOverlayBaseProps } from "../types";
import type { CampusFeatureCategory } from "../../schemas/campusGeojson";
import type {
  CampusWgs84Feature,
  CampusWgs84FeatureCollection,
} from "../../schemas/campusWgs84Geojson";
import {
  filterFeaturesByLevel,
  getAvailableLevels,
  getFeatureBounds,
  DEFAULT_CATEGORY_STYLES,
} from "../shared";

// ─── Props ──────────────────────────────────────────────────────────

export interface LeafletCampusOverlayProps extends CampusOverlayBaseProps {
  mapOptions?: L.MapOptions;
  tileLayer?:
    | {
        urlTemplate: string;
        options?: L.TileLayerOptions;
      }
    | false;
}

// ─── Default tile layer ─────────────────────────────────────────────

const DEFAULT_TILE_URL =
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

// ─── Level selector styles ─────────────────────────────────────────

const S = {
  container: {
    position: "relative" as const,
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column" as const,
  },
  mapContainer: {
    flex: 1,
    minHeight: 0,
  },
  levelBar: {
    position: "absolute" as const,
    top: 10,
    left: 10,
    zIndex: 1000,
    display: "flex",
    gap: 4,
    background: "rgba(255,255,255,0.96)",
    padding: "4px 8px",
    borderRadius: 6,
    boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
  },
  levelBtn: (active: boolean) => ({
    padding: "4px 10px",
    borderRadius: 4,
    border: "1px solid",
    borderColor: active ? "#2563EB" : "#D1D5DB",
    background: active ? "#EFF6FF" : "#FFFFFF",
    color: active ? "#2563EB" : "#374151",
    fontWeight: (active ? 600 : 400) as 400 | 600,
    fontSize: 13,
    cursor: "pointer",
  }),
} as const;

// ─── Component ──────────────────────────────────────────────────────

export function LeafletCampusOverlay({
  data,
  initialLevel,
  selectedLevel: controlledLevel,
  onLevelChange,
  onFeatureSelect,
  className,
  style,
  showLevelSelector = true,
  // showLegend — reserved for future use
  categoryStyles,
  mapOptions,
  tileLayer,
}: LeafletCampusOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);

  const levels = useMemo(() => getAvailableLevels(data), [data]);

  // Uncontrolled internal level state; falls back to first available level
  const [internalLevel, setInternalLevel] = useState<string | undefined>(
    undefined,
  );

  // Resolve current level: controlled prop > internal state > initialLevel > first level
  const currentLevel = useMemo(() => {
    if (controlledLevel !== undefined) return controlledLevel;
    if (internalLevel !== undefined) return internalLevel;
    if (initialLevel !== undefined) return String(initialLevel);
    return levels[0];
  }, [controlledLevel, internalLevel, initialLevel, levels]);

  const levelFeatures = useMemo(
    () => filterFeaturesByLevel(data, currentLevel),
    [data, currentLevel],
  );

  // ── Feature style function ──
  const featureStyleFn = useCallback(
    (feature: any): L.PathOptions => {
      const props = feature.properties as CampusWgs84Feature["properties"];
      const category = props.category as CampusFeatureCategory;
      const base = DEFAULT_CATEGORY_STYLES[category];
      const override = categoryStyles?.[category];
      const merged = override ? { ...base, ...override } : base;
      return {
        color: merged.strokeColor ?? "#999999",
        weight: merged.strokeWidth ?? 1,
        fillColor: merged.fillColor,
        fillOpacity: merged.fillOpacity ?? 0.5,
      };
    },
    [categoryStyles],
  );

  // ── onEachFeature: attach click handler ──
  const onEachFeature = useCallback(
    (feature: CampusWgs84Feature, layer: L.Layer) => {
      layer.on("click", (e: any) => {
        onFeatureSelect?.(feature, {
          levelId: currentLevel,
          lngLat: [e.latlng.lng, e.latlng.lat],
          adapter: "leaflet",
          sourceEvent: e,
        });
      });
    },
    [onFeatureSelect, currentLevel],
  );

  // ── Initialize map on mount ──
  useEffect(() => {
    if (!containerRef.current) return;

    const map = L.map(containerRef.current, {
      ...mapOptions,
    });
    mapRef.current = map;

    // Tile layer
    if (tileLayer !== false) {
      const url =
        tileLayer?.urlTemplate ?? DEFAULT_TILE_URL;
      const opts = tileLayer?.options ?? {};
      L.tileLayer(url, opts).addTo(map);
    }

    // GeoJSON layer
    const geoJson = L.geoJSON(levelFeatures, {
      style: featureStyleFn,
      onEachFeature,
    }).addTo(map);
    geoJsonLayerRef.current = geoJson;

    // Fit bounds
    if (levelFeatures.length > 0) {
      const bounds = getFeatureBounds(levelFeatures);
      map.fitBounds(
        L.latLngBounds([bounds.south, bounds.west], [bounds.north, bounds.east]),
      );
    }

    // Initialize uncontrolled level
    if (controlledLevel === undefined && internalLevel === undefined) {
      const start = initialLevel !== undefined
        ? String(initialLevel)
        : levels[0];
      setInternalLevel(start);
    }

    return () => {
      map.remove();
      mapRef.current = null;
      geoJsonLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Update GeoJSON layer when level or data changes ──
  useEffect(() => {
    const geoJson = geoJsonLayerRef.current;
    const map = mapRef.current;
    if (!geoJson || !map) return;

    geoJson.clearLayers();
    geoJson.addData(levelFeatures as any);

    if (levelFeatures.length > 0) {
      const bounds = getFeatureBounds(levelFeatures);
      map.fitBounds(
        L.latLngBounds([bounds.south, bounds.west], [bounds.north, bounds.east]),
      );
    }
  }, [levelFeatures]);

  // ── Level change handler ──
  const handleLevelChange = useCallback(
    (levelId: string) => {
      if (controlledLevel !== undefined) {
        onLevelChange?.(levelId);
      } else {
        setInternalLevel(levelId);
        onLevelChange?.(levelId);
      }
    },
    [controlledLevel, onLevelChange],
  );

  return (
    <div style={{ ...S.container, ...style }} className={className}>
      {/* Level selector */}
      {showLevelSelector && levels.length > 1 && (
        <div style={S.levelBar}>
          {levels.map((levelId) => (
            <button
              key={levelId}
              onClick={() => handleLevelChange(levelId)}
              style={S.levelBtn(currentLevel === levelId)}
            >
              {levelId}F
            </button>
          ))}
        </div>
      )}

      {/* Map container */}
      <div ref={containerRef} style={S.mapContainer} />
    </div>
  );
}
