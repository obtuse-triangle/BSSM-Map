import { useState } from "react";
import {
  TransformWrapper,
  TransformComponent,
} from "react-zoom-pan-pinch";
import type { FloorMapProps, FloorElement } from "../types";

const styles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    height: "100%",
    width: "100%",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  tabBar: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "12px 16px",
    borderBottom: "1px solid #e5e7eb",
    backgroundColor: "#fff",
    flexShrink: 0,
  },
  tab: (active: boolean) => ({
    padding: "8px 16px",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: 500,
    border: "none",
    cursor: "pointer",
    transition: "all 0.15s",
    backgroundColor: active ? "#2563eb" : "#f3f4f6",
    color: active ? "#fff" : "#4b5563",
  }),
  selectedPlace: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "14px",
    color: "#6b7280",
  },
  selectedPlaceBadge: {
    padding: "4px 12px",
    backgroundColor: "#dbeafe",
    color: "#1d4ed8",
    borderRadius: "6px",
    fontWeight: 500,
  },
  clearButton: {
    background: "none",
    border: "none",
    color: "#9ca3af",
    cursor: "pointer",
    fontSize: "16px",
    padding: "0 4px",
  },
  mapArea: {
    position: "relative" as const,
    flex: 1,
    overflow: "hidden",
    backgroundColor: "#f9fafb",
  },
  zoomControls: {
    position: "absolute" as const,
    bottom: "24px",
    left: "24px",
    display: "flex",
    gap: "8px",
    zIndex: 10,
  },
  zoomButton: {
    width: "40px",
    height: "40px",
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
    transition: "all 0.15s",
  },
  mapContent: {
    width: "100%",
    height: "100%",
    padding: "32px 6%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  mapWrapper: {
    position: "relative" as const,
    width: "100%",
    height: "100%",
  },
  element: (isSelected: boolean, isInteractive: boolean | null) => ({
    position: "absolute" as const,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center" as const,
    border: "1px solid",
    fontWeight: 550,
    fontSize: "10px",
    transition: "all 0.15s",
    overflow: "hidden",
    wordBreak: "break-all" as const,
    padding: "1px",
    lineHeight: "1.2",
    ...getStyleForState(isSelected, isInteractive),
  }),
  elementName: {
    fontSize: "10px",
    lineHeight: "1.2",
    pointerEvents: "none" as const,
  },
};

function getStyleForState(isSelected: boolean, isInteractive: boolean | null) {
  if (isSelected) {
    return {
      backgroundColor: "#bfdbfe",
      borderColor: "#60a5fa",
      boxShadow: "0 0 0 2px #60a5fa",
      zIndex: 10,
      cursor: "pointer",
    };
  }
  if (isInteractive === true) {
    return {
      backgroundColor: "#fff",
      borderColor: "#d1d5db",
      cursor: "pointer",
    };
  }
  if (isInteractive === false) {
    return {
      backgroundColor: "#e5e7eb",
      borderColor: "#d1d5db",
      cursor: "default",
    };
  }
  return {
    backgroundColor: "#f3f4f6",
    borderColor: "#d1d5db",
    cursor: "default",
  };
}

export function FloorMap({
  data,
  onPlaceClick,
  initialFloor,
  className,
  showZoomControls = true,
  zoomMin = 0.5,
  zoomMax = 4,
  initialScale = 1,
}: FloorMapProps) {
  const floorKeys = Object.keys(data.floors).sort(
    (a, b) => Number(a) - Number(b)
  );
  const [selectedFloor, setSelectedFloor] = useState(
    initialFloor ?? floorKeys[0]
  );
  const [selectedPlace, setSelectedPlace] = useState<string | null>(null);

  const elements = data.floors[selectedFloor]?.elements ?? [];

  const handleElementClick = (el: FloorElement) => {
    if (!el.interactive) return;
    const newPlace = selectedPlace === el.name ? null : el.name;
    setSelectedPlace(newPlace);
    onPlaceClick?.(el, selectedFloor);
  };

  return (
    <div style={styles.container} className={className}>
      <div style={styles.tabBar}>
        {floorKeys.map((key) => (
          <button
            key={key}
            onClick={() => {
              setSelectedFloor(key);
              setSelectedPlace(null);
            }}
            style={styles.tab(selectedFloor === key)}
          >
            {data.floors[key].label}
          </button>
        ))}

        {selectedPlace && (
          <div style={styles.selectedPlace}>
            <span style={styles.selectedPlaceBadge}>{selectedPlace}</span>
            <button
              onClick={() => setSelectedPlace(null)}
              style={styles.clearButton}
            >
              ✕
            </button>
          </div>
        )}
      </div>

      <div style={styles.mapArea}>
        <TransformWrapper
          initialScale={initialScale}
          minScale={zoomMin}
          maxScale={zoomMax}
          centerOnInit
        >
          {({ zoomIn, zoomOut, resetTransform }) => (
            <>
              {showZoomControls && (
                <div style={styles.zoomControls}>
                  <button
                    onClick={() => zoomIn()}
                    style={styles.zoomButton}
                  >
                    +
                  </button>
                  <button
                    onClick={() => resetTransform()}
                    style={styles.zoomButton}
                  >
                    ↺
                  </button>
                  <button
                    onClick={() => zoomOut()}
                    style={styles.zoomButton}
                  >
                    −
                  </button>
                </div>
              )}

              <TransformComponent
                wrapperStyle={{ width: "100%", height: "100%" }}
                contentStyle={{ width: "100%", height: "100%" }}
              >
                <div style={styles.mapContent}>
                  <div style={styles.mapWrapper}>
                    {elements.map((el) => {
                      const isSelected = selectedPlace === el.name;
                      return (
                        <div
                          key={`${selectedFloor}-${el.id}`}
                          onClick={() => handleElementClick(el)}
                          style={{
                            ...styles.element(isSelected, el.interactive),
                            top: `${el.y}%`,
                            left: `${el.x}%`,
                            width: `${el.width}%`,
                            height: `${el.height}%`,
                          }}
                        >
                          {el.name}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </TransformComponent>
            </>
          )}
        </TransformWrapper>
      </div>
    </div>
  );
}