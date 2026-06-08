import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type {
  CampusWgs84Feature,
  CampusWgs84FeatureCollection,
} from "../../src/schemas/campusWgs84Geojson";

// ─── maplibre-gl mock (factory must be self-contained due to hoisting) ──

const mockInstances: any[] = [];

vi.mock("maplibre-gl", () => {
  const listeners: Record<string, Function[]> = {};

  class MockMap {
    on = vi.fn((event: string, handler: Function) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
      if (event === "load") handler();
    });
    remove = vi.fn();
    addSource = vi.fn();
    addLayer = vi.fn();
    getSource = vi.fn(() => ({ setData: vi.fn() }));
    getCanvas = vi.fn(() => ({ style: {} }));
    setLayoutProperty = vi.fn();
    setPaintProperty = vi.fn();
    once = vi.fn((event: string, handler: Function) => {
      if (event === "load") handler();
    });
    fitBounds = vi.fn();

    constructor(options: any) {
      mockInstances.push(this);
      (this as any)._options = options;
    }
  }

  class MockPopup {
    setLngLat = vi.fn().mockReturnThis();
    setHTML = vi.fn().mockReturnThis();
    addTo = vi.fn().mockReturnThis();
    remove = vi.fn();
    on = vi.fn();
  }

  const mod = {
    Map: MockMap as any,
    Popup: MockPopup as any,
    _listeners: listeners,
    _mockInstances: mockInstances,
    _reset() {
      mockInstances.length = 0;
      for (const key of Object.keys(listeners)) {
        delete listeners[key];
      }
    },
  };
  return { default: mod, ...mod };
});

const maplibreGL = await import("maplibre-gl");
const { MapLibreCampusOverlay } = await import(
  "../../src/overlays/maplibre/MapLibreCampusOverlay"
);

function getLastMap() {
  const instances = (maplibreGL as any)._mockInstances;
  return instances.length > 0 ? instances[instances.length - 1] : null;
}

// ─── Test data helpers ─────────────────────────────────────────────

function wgs84Feature(
  overrides?: { properties?: Record<string, any> },
): CampusWgs84Feature {
  return {
    type: "Feature" as const,
    geometry: {
      type: "Polygon" as const,
      coordinates: [
        [
          [127.0, 37.5],
          [127.001, 37.5],
          [127.001, 37.501],
          [127.0, 37.501],
          [127.0, 37.5],
        ],
      ],
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

function wgs84Collection(
  features: CampusWgs84Feature[],
): CampusWgs84FeatureCollection {
  return {
    type: "FeatureCollection",
    features,
    metadata: { coordinateSystem: "WGS84" },
  };
}

const twoLevelData = wgs84Collection([
  wgs84Feature({
    properties: { name: "Room 101", level_id: "1", category: "classroom" },
  }),
  wgs84Feature({
    properties: { name: "Room 102", level_id: "1", category: "room" },
  }),
  wgs84Feature({
    properties: { name: "Office 201", level_id: "2", category: "office" },
  }),
]);

// ─── Tests ─────────────────────────────────────────────────────────

describe("MapLibreCampusOverlay", () => {
  beforeEach(() => {
    vi.clearAllMocks({ resetMocks: false });
    (maplibreGL as any)._reset();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a container div with valid data", () => {
    const { container } = render(
      <MapLibreCampusOverlay data={twoLevelData} />,
    );
    const mapDiv = container.querySelector("div");
    expect(mapDiv).not.toBeNull();
  });

  it("calls MapLibre Map constructor", () => {
    render(<MapLibreCampusOverlay data={twoLevelData} />);
    const map = getLastMap();
    expect(map).toBeTruthy();
    expect(map._options).toMatchObject({
      container: expect.any(HTMLElement),
    });
  });

  it("adds GeoJSON source with level-filtered features", () => {
    render(
      <MapLibreCampusOverlay data={twoLevelData} initialLevel="1" />,
    );
    const map = getLastMap()!;
    expect(map.addSource).toHaveBeenCalledWith(
      "campus",
      expect.objectContaining({
        type: "geojson",
        data: expect.objectContaining({
          type: "FeatureCollection",
        }),
      }),
    );
    const sourceCall = vi.mocked(map.addSource).mock.calls.find(
      (c: any[]) => c[0] === "campus",
    );
    const sourceData = sourceCall?.[1] as any;
    expect(sourceData.data.features).toHaveLength(2);
    expect(
      sourceData.data.features.every(
        (f: CampusWgs84Feature) => f.properties.level_id === "1",
      ),
    ).toBe(true);
  });

  it("triggers onFeatureSelect with correct context on feature click", () => {
    const onSelect = vi.fn();
    render(
      <MapLibreCampusOverlay data={twoLevelData} onFeatureSelect={onSelect} />,
    );
    const map = getLastMap()!;

    expect(map.on).toHaveBeenCalledWith(
      "click",
      "campus-fill",
      expect.any(Function),
    );

    const clickCall = vi.mocked(map.on).mock.calls.find(
      (c: any[]) => c[0] === "click" && c[1] === "campus-fill",
    );
    const clickHandler = clickCall?.[2] as Function;
    expect(clickHandler).toBeDefined();

    const mockEvent = {
      features: [twoLevelData.features[0]],
      lngLat: { lng: 127.0, lat: 37.5 },
    };
    clickHandler(mockEvent);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(
      twoLevelData.features[0],
      {
        levelId: "1",
        lngLat: [127.0, 37.5],
        adapter: "maplibre",
        sourceEvent: mockEvent,
      },
    );
  });

  it("respects controlled selectedLevel prop", () => {
    render(
      <MapLibreCampusOverlay data={twoLevelData} selectedLevel="2" />,
    );
    const map = getLastMap()!;
    const sourceCall = vi.mocked(map.addSource).mock.calls.find(
      (c: any[]) => c[0] === "campus",
    );
    const sourceData = sourceCall?.[1] as any;
    expect(sourceData.data.features).toHaveLength(1);
    expect(sourceData.data.features[0].properties.name).toBe("Office 201");
  });

  it("calls onLevelChange when level button is clicked (controlled mode)", () => {
    const onLevelChange = vi.fn();
    render(
      <MapLibreCampusOverlay
        data={twoLevelData}
        selectedLevel="1"
        onLevelChange={onLevelChange}
      />,
    );

    const level2Btn = screen.getAllByText("2F")[0];
    fireEvent.click(level2Btn);

    expect(onLevelChange).toHaveBeenCalledWith("2");
  });

  it("defaults to first level in uncontrolled mode", () => {
    render(<MapLibreCampusOverlay data={twoLevelData} />);
    const map = getLastMap()!;
    const sourceCall = vi.mocked(map.addSource).mock.calls.find(
      (c: any[]) => c[0] === "campus",
    );
    const sourceData = sourceCall?.[1] as any;
    expect(sourceData.data.features).toHaveLength(2);
    expect(sourceData.data.features[0].properties.level_id).toBe("1");
  });

  it("uses initialLevel in uncontrolled mode", () => {
    render(
      <MapLibreCampusOverlay data={twoLevelData} initialLevel="2" />,
    );
    const map = getLastMap()!;
    const sourceCall = vi.mocked(map.addSource).mock.calls.find(
      (c: any[]) => c[0] === "campus",
    );
    const sourceData = sourceCall?.[1] as any;
    expect(sourceData.data.features).toHaveLength(1);
    expect(sourceData.data.features[0].properties.level_id).toBe("2");
  });

  it("shows level selector when showLevelSelector is not false", () => {
    render(<MapLibreCampusOverlay data={twoLevelData} />);
    const level1Btns = screen.getAllByText("1F");
    const level2Btns = screen.getAllByText("2F");
    expect(level1Btns.length).toBeGreaterThanOrEqual(1);
    expect(level2Btns.length).toBeGreaterThanOrEqual(1);
  });

  it("hides level selector when showLevelSelector is false", () => {
    const { container } = render(
      <MapLibreCampusOverlay data={twoLevelData} showLevelSelector={false} />,
    );
    expect(container.querySelector('[data-testid="level-selector"]')).toBeNull();
  });

  it("calls map.remove() on unmount", () => {
    const { unmount } = render(
      <MapLibreCampusOverlay data={twoLevelData} />,
    );
    const map = getLastMap()!;
    unmount();
    expect(map.remove).toHaveBeenCalledTimes(1);
  });

  it("applies className to the container", () => {
    const { container } = render(
      <MapLibreCampusOverlay
        data={twoLevelData}
        className="my-map-class"
      />,
    );
    const outer = container.firstElementChild as HTMLElement;
    expect(outer.className).toContain("my-map-class");
  });

  it("applies style prop to the container", () => {
    const { container } = render(
      <MapLibreCampusOverlay
        data={twoLevelData}
        style={{ height: "500px" }}
      />,
    );
    const outer = container.firstElementChild as HTMLElement;
    expect(outer.style.height).toBe("500px");
  });

  it("uses OSM raster style by default", () => {
    render(<MapLibreCampusOverlay data={twoLevelData} />);
    const map = getLastMap()!;
    expect(map._options.style).toMatchObject({
      version: 8,
      sources: expect.objectContaining({
        osm: expect.any(Object),
      }),
    });
  });

  it("uses empty style when rasterStyle is 'none'", () => {
    render(
      <MapLibreCampusOverlay data={twoLevelData} rasterStyle="none" />,
    );
    const map = getLastMap()!;
    expect(map._options.style).toMatchObject({
      version: 8,
      sources: {},
    });
  });

  it("updates source data when level changes", () => {
    render(
      <MapLibreCampusOverlay data={twoLevelData} initialLevel="1" />,
    );
    const map = getLastMap()!;
    const setDataMock = vi.fn().mockImplementation(() => {});
    map.getSource.mockReturnValue({ setData: setDataMock });

    const level2Btn = screen.getAllByText("2F")[0];
    fireEvent.click(level2Btn);

    expect(setDataMock).toHaveBeenCalledTimes(1);
    const updatedData = setDataMock.mock.calls[0]?.[0] as any;
    expect(updatedData.features).toHaveLength(1);
    expect(updatedData.features[0].properties.level_id).toBe("2");
  });

  it("adds fill and line layers for campus", () => {
    render(<MapLibreCampusOverlay data={twoLevelData} />);
    const map = getLastMap()!;
    const layerIds = vi
      .mocked(map.addLayer)
      .mock.calls.map((c: any[]) => (c[0] as any).id);
    expect(layerIds).toContain("campus-fill");
    expect(layerIds).toContain("campus-outline");
  });

  it("passes mapOptions to Map constructor", () => {
    render(
      <MapLibreCampusOverlay
        data={twoLevelData}
        mapOptions={{ center: [127.0, 37.5], zoom: 18 }}
      />,
    );
    const map = getLastMap()!;
    expect(map._options).toMatchObject({
      center: [127.0, 37.5],
      zoom: 18,
    });
  });
});
