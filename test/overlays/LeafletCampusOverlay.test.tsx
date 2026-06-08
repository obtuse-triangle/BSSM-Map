import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { LeafletCampusOverlay } from "../../src/overlays/leaflet/LeafletCampusOverlay";
import type { CampusWgs84Feature, CampusWgs84FeatureCollection } from "../../src/schemas/campusWgs84Geojson";

// ─── Leaflet mock (hoisted for vi.mock factory) ───────────────────

const {
  mockMapInstance,
  mockGeoJsonLayer,
  mockTileLayerInstance,
  L,
} = vi.hoisted(() => {
  const mockMapInstance = {
    remove: vi.fn(),
    setView: vi.fn().mockReturnThis(),
    fitBounds: vi.fn().mockReturnThis(),
    addLayer: vi.fn().mockReturnThis(),
    removeLayer: vi.fn(),
    invalidateSize: vi.fn(),
  };

  const mockGeoJsonLayer = {
    addTo: vi.fn().mockReturnThis(),
    clearLayers: vi.fn(),
    addData: vi.fn(),
    on: vi.fn(),
  };

  const mockTileLayerInstance = {
    addTo: vi.fn().mockReturnThis(),
  };

  const L = {
    map: vi.fn(() => mockMapInstance),
    tileLayer: vi.fn(() => mockTileLayerInstance),
    geoJSON: vi.fn(() => mockGeoJsonLayer),
    latLngBounds: vi.fn(() => ({ extend: vi.fn().mockReturnThis() })),
    latLng: vi.fn((lat: number, lng: number) => ({ lat, lng })),
  };

  return { mockMapInstance, mockGeoJsonLayer, mockTileLayerInstance, L };
});

vi.mock("leaflet", () => {
  return { default: L, ...L };
});

// ─── Test data helpers ─────────────────────────────────────────────

function wgs84Feature(overrides?: { properties?: Record<string, any> }): CampusWgs84Feature {
  return {
    type: "Feature" as const,
    geometry: {
      type: "Polygon" as const,
      coordinates: [[[127.0, 37.5], [127.001, 37.5], [127.001, 37.501], [127.0, 37.501], [127.0, 37.5]]],
    },
    properties: {
      name: "Room A",
      name_ko: "Room A",
      level: 1,
      level_id: "1",
      building_id: "campus-main",
      category: "classroom",
      interactive: true,
      source: "test",
      ...(overrides?.properties ?? {}),
    },
  };
}

function wgs84Collection(features: CampusWgs84Feature[]): CampusWgs84FeatureCollection {
  return { type: "FeatureCollection", features, metadata: { coordinateSystem: "WGS84" } };
}

const twoLevelData = wgs84Collection([
  wgs84Feature({ properties: { name: "Room 101", level_id: "1", category: "classroom" } }),
  wgs84Feature({ properties: { name: "Room 102", level_id: "1", category: "room" } }),
  wgs84Feature({ properties: { name: "Office 201", level_id: "2", category: "office" } }),
]);

// ─── Tests ─────────────────────────────────────────────────────────

describe("LeafletCampusOverlay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a container div with valid data", () => {
    const { container } = render(<LeafletCampusOverlay data={twoLevelData} />);
    const mapDiv = container.querySelector("div");
    expect(mapDiv).not.toBeNull();
  });

  it("calls L.map constructor with the container element", () => {
    render(<LeafletCampusOverlay data={twoLevelData} />);
    expect(L.map).toHaveBeenCalledTimes(1);
    expect(L.map).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.any(Object),
    );
  });

  it("creates a GeoJSON layer and adds it to the map", () => {
    render(<LeafletCampusOverlay data={twoLevelData} />);
    expect(L.geoJSON).toHaveBeenCalledTimes(1);
    expect(mockGeoJsonLayer.addTo).toHaveBeenCalledWith(mockMapInstance);
  });

  it("filters features by level for GeoJSON layer", () => {
    render(<LeafletCampusOverlay data={twoLevelData} initialLevel="1" />);
    // L.geoJSON is called with filtered features (level "1" has 2 features)
    const featuresArg = vi.mocked(L.geoJSON).mock.calls[0]?.[0];
    expect(featuresArg).toHaveLength(2);
  });

  it("triggers onFeatureSelect with correct context on feature click", () => {
    const onSelect = vi.fn();
    render(<LeafletCampusOverlay data={twoLevelData} onFeatureSelect={onSelect} />);

    // Extract the onEachFeature callback from geoJSON options
    const geoJsonOptions = vi.mocked(L.geoJSON).mock.calls[0]?.[1] as any;
    expect(geoJsonOptions).toBeDefined();
    expect(typeof geoJsonOptions.onEachFeature).toBe("function");

    // Simulate onEachFeature being called for a feature
    const testFeature = twoLevelData.features[0];
    const mockLeafletLayer = { on: vi.fn() };
    geoJsonOptions.onEachFeature(testFeature, mockLeafletLayer);

    // The layer.on("click", handler) should have been registered
    expect(mockLeafletLayer.on).toHaveBeenCalledWith("click", expect.any(Function));

    // Extract the click handler and simulate a click event
    const clickHandler = vi.mocked(mockLeafletLayer.on).mock.calls.find(
      (c) => c[0] === "click",
    )?.[1];
    expect(clickHandler).toBeDefined();

    const mockEvent = { latlng: { lat: 37.5, lng: 127.0 } };
    clickHandler(mockEvent);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(
      testFeature,
      {
        levelId: "1",
        lngLat: [127.0, 37.5],
        adapter: "leaflet",
        sourceEvent: mockEvent,
      },
    );
  });

  it("respects controlled selectedLevel prop", () => {
    render(<LeafletCampusOverlay data={twoLevelData} selectedLevel="2" />);
    const featuresArg = vi.mocked(L.geoJSON).mock.calls[0]?.[0];
    expect(featuresArg).toHaveLength(1);
    expect(featuresArg[0].properties.name).toBe("Office 201");
  });

  it("calls onLevelChange when level button is clicked (controlled mode)", () => {
    const onLevelChange = vi.fn();
    render(
      <LeafletCampusOverlay
        data={twoLevelData}
        selectedLevel="1"
        onLevelChange={onLevelChange}
      />,
    );

    // Find and click the level 2 button
    const level2Btn = screen.getAllByText("2F")[0];
    fireEvent.click(level2Btn);

    expect(onLevelChange).toHaveBeenCalledWith("2");
  });

  it("defaults to first level in uncontrolled mode", () => {
    render(<LeafletCampusOverlay data={twoLevelData} />);
    const featuresArg = vi.mocked(L.geoJSON).mock.calls[0]?.[0];
    expect(featuresArg).toHaveLength(2);
    // Level "1" is the first sorted level
    expect(featuresArg[0].properties.level_id).toBe("1");
  });

  it("uses initialLevel in uncontrolled mode", () => {
    render(<LeafletCampusOverlay data={twoLevelData} initialLevel="2" />);
    const featuresArg = vi.mocked(L.geoJSON).mock.calls[0]?.[0];
    expect(featuresArg).toHaveLength(1);
    expect(featuresArg[0].properties.level_id).toBe("2");
  });

  it("shows level selector when showLevelSelector is not false", () => {
    render(<LeafletCampusOverlay data={twoLevelData} />);
    const level1Btns = screen.getAllByText("1F");
    const level2Btns = screen.getAllByText("2F");
    expect(level1Btns.length).toBeGreaterThanOrEqual(1);
    expect(level2Btns.length).toBeGreaterThanOrEqual(1);
  });

  it("hides level selector when showLevelSelector is false", () => {
    render(<LeafletCampusOverlay data={twoLevelData} showLevelSelector={false} />);
    expect(screen.queryByText("1F")).toBeNull();
    expect(screen.queryByText("2F")).toBeNull();
  });

  it("calls map.remove() on unmount", () => {
    const { unmount } = render(<LeafletCampusOverlay data={twoLevelData} />);
    unmount();
    expect(mockMapInstance.remove).toHaveBeenCalledTimes(1);
  });

  it("adds tile layer by default (OSM)", () => {
    render(<LeafletCampusOverlay data={twoLevelData} />);
    expect(L.tileLayer).toHaveBeenCalledTimes(1);
    expect(L.tileLayer).toHaveBeenCalledWith(
      expect.stringContaining("openstreetmap"),
      expect.any(Object),
    );
  });

  it("skips tile layer when tileLayer prop is false", () => {
    render(<LeafletCampusOverlay data={twoLevelData} tileLayer={false} />);
    expect(L.tileLayer).not.toHaveBeenCalled();
  });

  it("uses custom tile layer when tileLayer prop is provided", () => {
    render(
      <LeafletCampusOverlay
        data={twoLevelData}
        tileLayer={{ urlTemplate: "https://custom-tiles/{z}/{x}/{y}.png", options: { maxZoom: 19 } }}
      />,
    );
    expect(L.tileLayer).toHaveBeenCalledWith(
      "https://custom-tiles/{z}/{x}/{y}.png",
      expect.objectContaining({ maxZoom: 19 }),
    );
  });

  it("applies className to the container", () => {
    const { container } = render(
      <LeafletCampusOverlay data={twoLevelData} className="my-map-class" />,
    );
    const outer = container.firstElementChild as HTMLElement;
    expect(outer.className).toContain("my-map-class");
  });

  it("applies style prop to the container", () => {
    const { container } = render(
      <LeafletCampusOverlay data={twoLevelData} style={{ height: "500px" }} />,
    );
    const outer = container.firstElementChild as HTMLElement;
    expect(outer.style.height).toBe("500px");
  });

  it("applies categoryStyles merge to feature style function", () => {
    const customStyle = { fillColor: "#FF0000", fillOpacity: 0.9 };
    render(
      <LeafletCampusOverlay
        data={twoLevelData}
        categoryStyles={{ classroom: customStyle }}
      />,
    );

    const geoJsonOptions = vi.mocked(L.geoJSON).mock.calls[0]?.[1] as any;
    expect(typeof geoJsonOptions.style).toBe("function");

    const result = geoJsonOptions.style(twoLevelData.features[0]);
    // Custom style overrides default for classroom
    expect(result.fillColor).toBe("#FF0000");
    expect(result.fillOpacity).toBe(0.9);
  });
});
