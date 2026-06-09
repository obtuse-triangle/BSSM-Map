import { useState, useMemo, useCallback } from "react";
import {
  TransformWrapper,
  TransformComponent,
} from "react-zoom-pan-pinch";
import {
  campusFeatureCollectionSchema,
} from "../schemas/campusGeojson";
import type {
  CampusFeatureCollection,
  CampusFeature,
} from "../schemas/campusGeojson";

export interface CampusMapProps {
  /** Campus GeoJSON FeatureCollection (local coordinate space) */
  data: CampusFeatureCollection;
  /** Called when a clickable feature is selected */
  onFeatureSelect?: (feature: CampusFeature) => void;
  /** Initial floor level (1-4) */
  initialLevel?: number;
  /**
   * Rendering mode:
   * - "floorplan" – SVG polygons with zoom/pan (default)
   * - "overlay"   – placeholder for WGS84 overlay mode (requires MapLibre as optional peer dep)
   */
  mode?: "floorplan" | "overlay";
  className?: string;
  showZoomControls?: boolean;
  showLegend?: boolean;
  zoomMin?: number;
  zoomMax?: number;
  initialScale?: number;
}

const CATEGORY_STYLE: Record<string, { fill: string; stroke: string }> = {
  structural:  { fill: "#374151", stroke: "#1F2937" },
  classroom:   { fill: "#DBEAFE", stroke: "#93C5FD" },
  room:        { fill: "#D1FAE5", stroke: "#6EE7B7" },
  office:      { fill: "#E0E7FF", stroke: "#A5B4FC" },
  corridor:    { fill: "#F3F4F6", stroke: "#D1D5DB" },
  stair:       { fill: "#FEF3C7", stroke: "#FCD34D" },
  elevator:    { fill: "#EDE9FE", stroke: "#C4B5FD" },
  restroom:    { fill: "#FCE7F3", stroke: "#F9A8D4" },
  outdoor:     { fill: "#ECFDF5", stroke: "#6EE7B7" },
  parking:     { fill: "#FEF9C3", stroke: "#FDE047" },
  facility:    { fill: "#FFEDD5", stroke: "#FB923C" },
  unknown:     { fill: "#F9FAFB", stroke: "#9CA3AF" },
};

const CATEGORY_LABEL: Record<string, string> = {
  structural: "Structural",
  classroom:  "Classroom",
  room:       "Room",
  office:     "Office",
  corridor:   "Corridor",
  stair:      "Stair",
  elevator:   "Elevator",
  restroom:   "Restroom",
  outdoor:    "Outdoor",
  parking:    "Parking",
  facility:   "Facility",
  unknown:    "Unknown",
};

function toSvgY(y: number): number {
  return 1 - y;
}

function ringPoints(coords: [number, number][]): string {
  return coords.map(([x, y]) => `${x},${toSvgY(y)}`).join(" ");
}

const S = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    height: "100%",
    width: "100%",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  bar: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 16px",
    background: "#FFFFFF",
    borderBottom: "1px solid #E5E7EB",
    flexShrink: 0,
    flexWrap: "wrap" as const,
    zIndex: 20,
  },
  barLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: "#374151",
    marginRight: 4,
  },
  levelBtn: (active: boolean) => ({
    padding: "4px 14px",
    borderRadius: 6,
    border: "1px solid",
    borderColor: active ? "#2563EB" : "#D1D5DB",
    background: active ? "#EFF6FF" : "#FFFFFF",
    color: active ? "#2563EB" : "#374151",
    fontWeight: (active ? 600 : 400) as 400 | 600,
    fontSize: 13,
    cursor: "pointer",
    transition: "all 0.12s ease",
  }),
  countBadge: {
    color: "#9CA3AF",
    fontSize: 12,
    marginLeft: "auto",
  },
  canvas: {
    flex: 1,
    minHeight: 0,
    background: "#F3F4F6",
    position: "relative" as const,
    overflow: "hidden",
  },
  zoomControls: {
    position: "absolute" as const,
    bottom: "24px",
    left: "24px",
    display: "flex",
    gap: "8px",
    zIndex: 10,
  },
  zoomBtn: {
    width: "44px",
    height: "44px",
    backgroundColor: "#fff",
    borderRadius: "8px",
    border: "1px solid #e5e7eb",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "18px",
    fontWeight: 600,
    color: "#4b5563",
    cursor: "pointer",
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
  },
  legend: {
    position: "absolute" as const,
    top: 10,
    right: 10,
    background: "rgba(255,255,255,0.96)",
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 11,
    boxShadow: "0 1px 6px rgba(0,0,0,0.1)",
    border: "1px solid #E5E7EB",
    zIndex: 15,
  },
  legendTitle: {
    fontWeight: 700,
    fontSize: 12,
    marginBottom: 6,
    color: "#1F2937",
    letterSpacing: "0.02em",
  },
  legendRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 3,
  },
  legendSwatch: (fill: string, stroke: string) => ({
    display: "inline-block",
    width: 12,
    height: 12,
    borderRadius: 2,
    background: fill,
    border: `1px solid ${stroke}`,
    flexShrink: 0,
  }),
  legendLabel: {
    color: "#4B5563",
  },
  statusBlock: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column" as const,
    gap: 8,
    color: "#9CA3AF",
    fontSize: 14,
    fontFamily: "system-ui, -apple-system, sans-serif",
    background: "#F9FAFB",
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: "#6B7280",
  },
  overlayMessage: {
    maxWidth: 400,
    textAlign: "center" as const,
    lineHeight: 1.6,
    color: "#6B7280",
  },
  overlayCode: {
    background: "#F3F4F6",
    padding: "2px 6px",
    borderRadius: 4,
    fontFamily: "monospace",
    fontSize: 12,
    color: "#374151",
  },
} as const;

export function CampusMap({
  data,
  onFeatureSelect,
  initialLevel,
  mode = "floorplan",
  className,
  showZoomControls = true,
  showLegend = true,
  zoomMin = 0.3,
  zoomMax = 25,
  initialScale = 1,
}: CampusMapProps) {
  if (mode === "overlay") {
    return (
      <div style={S.container} className={className}>
        <div style={S.statusBlock}>
          <div style={S.statusTitle}>WGS84 Overlay Mode</div>
          <div style={S.overlayMessage}>
            This mode requires{" "}
            <code style={S.overlayCode}>maplibre-gl</code> and{" "}
            <code style={S.overlayCode}>@maplibre/maplibre-react</code>{" "}
            as optional peer dependencies.
            <br /><br />
            Pass WGS84 GeoJSON (exported via <code style={S.overlayCode}>export-wgs84-geojson</code>)
            to the map component once set up.
          </div>
        </div>
      </div>
    );
  }

  const validation = useMemo(
    () => campusFeatureCollectionSchema.safeParse(data),
    [data],
  );

  if (!validation.success) {
    const issues = validation.error.issues
      .map((i) => i.message)
      .join("; ");
    return (
      <div style={S.container} className={className}>
        <div style={S.statusBlock}>
          <div style={S.statusTitle}>Invalid Campus Data</div>
          <div>{issues}</div>
        </div>
      </div>
    );
  }

  const validData = validation.data;

  if (validData.features.length === 0) {
    return (
      <div style={S.container} className={className}>
        <div style={S.statusBlock}>
          <div style={S.statusTitle}>No Features</div>
          <div>The campus feature collection is empty.</div>
        </div>
      </div>
    );
  }

  const levels = useMemo(() => {
    const ids = new Set<string>();
    for (const f of validData.features) {
      ids.add(f.properties.level_id);
    }
    return Array.from(ids).sort((a, b) => Number(a) - Number(b));
  }, [validData]);

  const [selectedLevel, setSelectedLevel] = useState(
    initialLevel !== undefined ? String(initialLevel) : levels[0],
  );
  const [selectedFeature, setSelectedFeature] = useState<CampusFeature | null>(null);

  const levelFeatures = useMemo(
    () => validData.features.filter((f) => f.properties.level_id === selectedLevel),
    [validData, selectedLevel],
  );

  const handleFeatureClick = useCallback(
    (feature: CampusFeature) => {
      if (selectedFeature === feature) {
        setSelectedFeature(null);
        return;
      }
      setSelectedFeature(feature);
      onFeatureSelect?.(feature);
    },
    [selectedFeature, onFeatureSelect],
  );

  const handleLevelChange = useCallback((levelId: string) => {
    setSelectedLevel(levelId);
    setSelectedFeature(null);
  }, []);

  const legendEntries = useMemo(() => {
    const cats = new Set<string>();
    for (const f of levelFeatures) {
      cats.add(f.properties.category);
    }
    return Array.from(cats);
  }, [levelFeatures]);

  return (
    <div style={S.container} className={className}>
      {/* ── Level selector bar ── */}
      <div style={S.bar}>
        <span style={S.barLabel}>Level</span>
        {levels.map((levelId) => (
          <button
            key={levelId}
            onClick={() => handleLevelChange(levelId)}
            style={S.levelBtn(selectedLevel === levelId)}
          >
            {levelId}F
          </button>
        ))}
        <span style={S.countBadge}>
          {levelFeatures.length} feature{levelFeatures.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Canvas ── */}
      <div style={S.canvas}>
        <TransformWrapper
          initialScale={initialScale}
          minScale={zoomMin}
          maxScale={zoomMax}
          centerOnInit
          limitToBounds={false}
          wheel={{ step: 0.15 }}
        >
          {({ zoomIn, zoomOut, resetTransform }) => (
            <>
              {showZoomControls && (
                <div style={S.zoomControls}>
                  <button onClick={() => zoomIn()} style={S.zoomBtn}>+</button>
                  <button onClick={() => resetTransform()} style={S.zoomBtn}>↺</button>
                  <button onClick={() => zoomOut()} style={S.zoomBtn}>−</button>
                </div>
              )}

              <TransformComponent
                wrapperStyle={{ width: "100%", height: "100%" }}
                contentStyle={{ width: "100%", height: "100%" }}
              >
                <svg
                  viewBox="0 0 1 1"
                  preserveAspectRatio="xMidYMid meet"
                  style={{ width: "100%", height: "100%", display: "block" }}
                >
                  {/* SVG defs for hatch pattern */}
                  <defs>
                    <pattern
                      id="campus-hatch"
                      patternUnits="userSpaceOnUse"
                      width={0.025}
                      height={0.025}
                      patternTransform="rotate(45)"
                    >
                      <line
                        x1={0} y1={0}
                        x2={0} y2={0.025}
                        stroke="#D1D5DB"
                        strokeWidth={0.0025}
                      />
                    </pattern>
                  </defs>

                  {/* ── Features ── */}
                  {levelFeatures.map((feat, fi) => {
                    const { category } = feat.properties;
                    const catStyle = CATEGORY_STYLE[category] ?? CATEGORY_STYLE.unknown;
                    const isSelected = selectedFeature === feat;
                    const rings = feat.geometry.coordinates as [number, number][][];

                    return rings.map((ring, ri) => {
                      const isHole = ri > 0;
                      return (
                        <polygon
                          key={`${fi}-${ri}`}
                          points={ringPoints(ring)}
                          fill={
                            isHole
                              ? "#F3F4F6"
                              : isSelected
                                ? "#BFDBFE"
                                : catStyle.fill
                          }
                          stroke={
                            isSelected ? "#2563EB" : catStyle.stroke
                          }
                          strokeWidth={isSelected ? 0.004 : 0.0008}
                          strokeLinejoin="round"
                          opacity={category === "structural" ? 1 : 0.85}
                          style={{ cursor: "pointer", transition: "all 0.12s ease" }}
                          onClick={() => handleFeatureClick(feat)}
                        />
                      );
                    });
                  })}
                </svg>
              </TransformComponent>
            </>
          )}
        </TransformWrapper>

        {/* ── Legend ── */}
        {showLegend && legendEntries.length > 0 && (
          <div style={S.legend}>
            <div style={S.legendTitle}>Legend</div>
            {legendEntries.map((cat) => {
              const s = CATEGORY_STYLE[cat] ?? CATEGORY_STYLE.unknown;
              return (
                <div key={cat} style={S.legendRow}>
                  <span style={S.legendSwatch(s.fill, s.stroke)} />
                  <span style={S.legendLabel}>
                    {CATEGORY_LABEL[cat] ?? cat}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
