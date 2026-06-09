import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CampusMap } from "../../src/components/CampusMap";
import type { CampusFeatureCollection } from "../../src/schemas/campusGeojson";

function makeRing(
  coords: [number, number][],
): [number, number][] {
  const ring = [...coords];
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push(first);
  }
  return ring;
}

function feature(
  overrides?: Partial<ReturnType<typeof makeDefaultFeature>>,
): CampusFeatureCollection["features"][number] {
  const defaults = {
    type: "Feature" as const,
    geometry: {
      type: "Polygon" as const,
      coordinates: [
        makeRing([
          [0, 0],
          [0.1, 0],
          [0.1, 0.1],
          [0, 0.1],
        ]),
      ],
    },
    properties: {
      name: "Room A",
      name_ko: "Room A",
      level: 1,
      level_id: "1",
      building_id: "campus-main",
      category: "classroom" as const,
      interactive: true,
      source: "test",
    },
  };
  const merged = { ...defaults, ...overrides };
  return merged as CampusFeatureCollection["features"][number];
}

function collection(
  features: CampusFeatureCollection["features"][number][],
): CampusFeatureCollection {
  return {
    type: "FeatureCollection",
    features,
    metadata: {
      coordinateSystem: "local",
      units: "source-normalized",
    },
  } as CampusFeatureCollection;
}

const twoLevelData = collection([
  feature({
    properties: {
      name: "Room 101",
      name_ko: "Room 101",
      level: 1,
      level_id: "1",
      building_id: "campus-main",
      category: "classroom",
      interactive: true,
      source: "test",
    },
  }),
  feature({
    properties: {
      name: "Room 102",
      name_ko: "Room 102",
      level: 1,
      level_id: "1",
      building_id: "campus-main",
      category: "room",
      interactive: true,
      source: "test",
    },
  }),
  feature({
    properties: {
      name: "Stair A",
      name_ko: "Stair A",
      level: 1,
      level_id: "1",
      building_id: "campus-main",
      category: "stair",
      interactive: true,
      source: "test",
    },
  }),
  feature({
    properties: {
      name: "Office 201",
      name_ko: "Office 201",
      level: 2,
      level_id: "2",
      building_id: "campus-main",
      category: "office",
      interactive: true,
      source: "test",
    },
  }),
]);

const emptyData = collection([]);

describe("CampusMap", () => {
  it("renders the correct number of SVG polygons for the initial floor", () => {
    const { container } = render(<CampusMap data={twoLevelData} />);
    const polygons = container.querySelectorAll("polygon");
    expect(polygons.length).toBe(3);
  });

  it("renders correct polygon count when initialLevel is set to 2", () => {
    const { container } = render(
      <CampusMap data={twoLevelData} initialLevel={2} />,
    );
    const polygons = container.querySelectorAll("polygon");
    expect(polygons.length).toBe(1);
  });

  it("calls onFeatureSelect when a polygon is clicked", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <CampusMap data={twoLevelData} onFeatureSelect={onSelect} />,
    );
    const polygon = container.querySelector("polygon")!;
    fireEvent.click(polygon);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "Feature",
        properties: expect.objectContaining({ name: "Room 101" }),
      }),
    );
  });

  it("shows a feature count badge for the selected floor", () => {
    render(<CampusMap data={twoLevelData} />);
    const badges = screen.getAllByText(/3 features?/);
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it("renders level selector buttons for each available level", () => {
    render(<CampusMap data={twoLevelData} />);
    const level1Btns = screen.getAllByText("1F");
    const level2Btns = screen.getAllByText("2F");
    expect(level1Btns.length).toBeGreaterThanOrEqual(1);
    expect(level2Btns.length).toBeGreaterThanOrEqual(1);
  });

  it("displays legend for categories present on the floor", () => {
    render(<CampusMap data={twoLevelData} />);
    const classroomLabels = screen.getAllByText("Classroom");
    const roomLabels = screen.getAllByText("Room");
    const stairLabels = screen.getAllByText("Stair");
    expect(classroomLabels.length).toBeGreaterThanOrEqual(1);
    expect(roomLabels.length).toBeGreaterThanOrEqual(1);
    expect(stairLabels.length).toBeGreaterThanOrEqual(1);
  });

  it("renders zoom controls when showZoomControls is true", () => {
    const { container } = render(
      <CampusMap data={twoLevelData} showZoomControls={true} />,
    );
    const btns = container.querySelectorAll("button");
    const hasZoomBtn = Array.from(btns).some((b) => b.textContent === "+");
    expect(hasZoomBtn).toBe(true);
  });

  it("hides legend when showLegend is false", () => {
    const { container } = render(
      <CampusMap data={twoLevelData} showLegend={false} />,
    );
    expect(container.textContent).not.toContain("Legend");
  });

  it("shows an error state for invalid data", () => {
    const invalidData = { type: "FeatureCollection", features: "nope" };
    const { container } = render(
      // biome-ignore lint/suspicious/noExplicitAny: deliberate invalid data test
      <CampusMap data={invalidData as any} />,
    );
    expect(container.textContent).toContain("Invalid Campus Data");
  });

  it("shows an empty state when the feature collection has no features", () => {
    const { container } = render(<CampusMap data={emptyData} />);
    expect(container.textContent).toContain("No Features");
  });

  it("renders overlay mode placeholder when mode is 'overlay'", () => {
    render(<CampusMap data={twoLevelData} mode="overlay" />);
    expect(screen.getByText("WGS84 Overlay Mode")).toBeDefined();
  });

  it("applies className to the container", () => {
    const { container } = render(
      <CampusMap data={twoLevelData} className="my-test-class" />,
    );
    const outer = container.firstElementChild as HTMLElement;
    expect(outer.className).toContain("my-test-class");
  });
});
