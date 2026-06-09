import "maplibre-gl/dist/maplibre-gl.css";
import { useState } from "react";
import { FloorMap, bssmFloorMap, CampusMap } from "school-floor-map";
import { campusFeatureCollection } from "school-floor-map/data/campus";
import {
  MapLibreCampusOverlay,
} from "school-floor-map/overlays/maplibre";
import { campusWgs84FeatureCollection } from "school-floor-map/data/campus-wgs84";
import type { CampusFeature } from "school-floor-map";
import type {
  CampusWgs84Feature,
  OverlaySelectionContext,
} from "school-floor-map/overlays/maplibre";

type TabId = "floormap" | "campus" | "overlay";

const TABS: { id: TabId; label: string }[] = [
  { id: "floormap", label: "Floor Map" },
  { id: "campus", label: "Campus Outline" },
  { id: "overlay", label: "Map Overlay" },
];

// ─── Floor Map Tab ──────────────────────────────────────────────────

function FloorMapTab() {
  const [selectedPlace, setSelectedPlace] = useState<{
    name: string;
    floor: string;
  } | null>(null);

  return (
    <>
      <FloorMap
        data={bssmFloorMap}
        onPlaceClick={(element, floorKey) => {
          setSelectedPlace({ name: element.name, floor: floorKey });
          console.log(`Clicked ${element.name} on floor ${floorKey}`);
        }}
      />
      {selectedPlace && (
        <div
          style={{
            position: "absolute",
            bottom: 10,
            left: 10,
            background: "white",
            padding: 10,
            borderRadius: 6,
            boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
          }}
        >
          <strong>Selected:</strong> {selectedPlace.name} (Floor{" "}
          {selectedPlace.floor})
        </div>
      )}
    </>
  );
}

// ─── Campus Outline Tab ────────────────────────────────────────────

function CampusOutlineTab() {
  const [selectedFeature, setSelectedFeature] =
    useState<CampusFeature | null>(null);

  return (
    <>
      <CampusMap
        data={campusFeatureCollection}
        onFeatureSelect={(feature) => {
          setSelectedFeature(feature);
          console.log("Selected campus feature:", feature.properties.name);
        }}
      />
      {selectedFeature && (
        <div
          style={{
            position: "absolute",
            bottom: 10,
            left: 10,
            background: "white",
            padding: 10,
            borderRadius: 6,
            boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
          }}
        >
          <strong>Selected:</strong> {selectedFeature.properties.name}
        </div>
      )}
    </>
  );
}

// ─── Map Overlay Tab ────────────────────────────────────────────────

function MapOverlayTab() {
  const [selectedFeature, setSelectedFeature] =
    useState<CampusWgs84Feature | null>(null);

  return (
    <>
      <MapLibreCampusOverlay
        data={campusWgs84FeatureCollection}
        onFeatureSelect={(feature: CampusWgs84Feature, context: OverlaySelectionContext) => {
          setSelectedFeature(feature);
          console.log(
            "Selected:",
            feature.properties.name,
            "at",
            context.lngLat,
          );
        }}
        rasterStyle="osm"
        style={{ width: "100%", height: "100%" }}
      />
      {selectedFeature && (
        <div
          style={{
            position: "absolute",
            bottom: 10,
            left: 10,
            background: "white",
            padding: 10,
            borderRadius: 6,
            boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
          }}
        >
          <strong>Selected:</strong> {selectedFeature.properties.name} (
          {selectedFeature.properties.category})
          <br />
          <small>Level: {selectedFeature.properties.level_id}F</small>
        </div>
      )}
    </>
  );
}

// ─── App ──────────────────────────────────────────────────────────

function App() {
  const [activeTab, setActiveTab] = useState<TabId>("floormap");

  return (
    <div
      style={{
        height: "100dvh",
        minHeight: "100vh",
        width: "100vw",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          gap: 0,
          borderBottom: "1px solid #d1d5db",
          background: "#f9fafb",
          flexShrink: 0,
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "8px 20px",
              border: "none",
              borderBottom:
                activeTab === tab.id ? "2px solid #2563eb" : "2px solid transparent",
              background: "transparent",
              cursor: "pointer",
              fontWeight: activeTab === tab.id ? 600 : 400,
              color: activeTab === tab.id ? "#2563eb" : "#374151",
              fontSize: 14,
              fontFamily: "system-ui, sans-serif",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content area */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {activeTab === "floormap" && <FloorMapTab />}
        {activeTab === "campus" && <CampusOutlineTab />}
        {activeTab === "overlay" && <MapOverlayTab />}
      </div>
    </div>
  );
}

export default App;
