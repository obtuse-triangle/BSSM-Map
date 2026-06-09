# school-floor-map

Interactive school floor plan React component with zoom/pan support.

## Demo

**[Live Demo](https://obtuse-triangle.github.io/BSSM-Map/)** — BSSM school floor map

## Install

```bash
npm install school-floor-map react-zoom-pan-pinch
```

## Usage

```tsx
import { FloorMap, bssmFloorMap } from "school-floor-map";

function App() {
  return (
    <div style={{ height: "100vh" }}>
      <FloorMap
        data={bssmFloorMap}
        onPlaceClick={(element, floorKey) => {
          console.log(`Clicked ${element.name} on floor ${floorKey}`);
        }}
      />
    </div>
  );
}
```

## Bring Your Own Data

```tsx
import { FloorMap } from "school-floor-map";
import type { FloorMapData } from "school-floor-map";

const mySchoolData: FloorMapData = {
  version: 1,
  school: "My School",
  floors: {
    "1": {
      label: "1F",
      elements: [
        {
          id: 1,
          name: "Classroom 101",
          x: 10,
          y: 20,
          width: 15,
          height: 10,
          interactive: true,
        },
      ],
    },
  },
};

<FloorMap data={mySchoolData} />;
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `data` | `FloorMapData` | required | Floor plan data |
| `onPlaceClick` | `(element, floorKey) => void` | - | Callback when a place is clicked |
| `initialFloor` | `string` | first floor key | Initially selected floor |
| `className` | `string` | - | CSS class for container |
| `showZoomControls` | `boolean` | `true` | Show zoom in/out/reset buttons |
| `zoomMin` | `number` | `0.5` | Minimum zoom scale |
| `zoomMax` | `number` | `4` | Maximum zoom scale |
| `initialScale` | `number` | `1` | Initial zoom scale |

## Data Format

```ts
interface FloorMapData {
  version: number;
  school: string;
  floors: Record<string, {
    label: string;
    elements: FloorElement[];
  }>;
}

interface FloorElement {
  id: number;
  name: string;
  x: number;       // % from left
  y: number;       // % from top
  width: number;   // % width
  height: number;  // % height
  interactive: boolean | null;  // null = structural only
}
```

## Map Overlay Components

The library provides optional React components for rendering campus data as WGS84 overlays on MapLibre GL or Leaflet maps.

### Installation

```bash
# MapLibre users
pnpm add school-floor-map maplibre-gl

# Leaflet users
pnpm add school-floor-map leaflet
```

MapLibre and Leaflet are optional peer dependencies — install only the one you use.

### Quick Start (MapLibre)

```tsx
import { MapLibreCampusOverlay } from "school-floor-map/overlays/maplibre";
import { campusWgs84FeatureCollection } from "school-floor-map/data/campus-wgs84";
import "maplibre-gl/dist/maplibre-gl.css";

function App() {
  return (
    <MapLibreCampusOverlay
      data={campusWgs84FeatureCollection}
      onFeatureSelect={(feature, context) => {
        console.log("Selected:", feature.properties.name);
        console.log("Location:", context.lngLat);
        console.log("Adapter:", context.adapter);
      }}
    />
  );
}
```

### Quick Start (Leaflet)

```tsx
import { LeafletCampusOverlay } from "school-floor-map/overlays/leaflet";
import { campusWgs84FeatureCollection } from "school-floor-map/data/campus-wgs84";
import "leaflet/dist/leaflet.css";

function App() {
  return (
    <LeafletCampusOverlay
      data={campusWgs84FeatureCollection}
      onFeatureSelect={(feature, context) => {
        console.log("Selected:", feature.properties.name, "at", context.lngLat);
      }}
    />
  );
}
```

### Selection Callback

Both components share a unified callback contract:

```ts
onFeatureSelect?: (feature: CampusWgs84Feature, context: OverlaySelectionContext) => void;

interface OverlaySelectionContext {
  levelId: string;
  lngLat: [lng: number, lat: number];
  adapter: "maplibre" | "leaflet";
  sourceEvent?: unknown;
}
```

> ⚠️ **Accuracy Notice**: The campus overlay data is georeferenced from floor plan
> images using affine transformation with 2-4 control points per floor. Typical
> residual error is 2-5 meters. This overlay is **schematic** — suitable for
> visualization and approximate indoor positioning. It is **NOT**:
> - GPS-precise or survey-grade
> - Suitable for turn-by-turn navigation
> - Safety-critical or suitable for emergency routing

For full props, styling, data export, and accuracy caveats, see the [Overlay Guide](docs/overlay-guide.md).

## Peer Dependencies

- `react >= 18`
- `react-dom >= 18`
- `react-zoom-pan-pinch >= 3`
- `maplibre-gl >= 3` (optional — required for `school-floor-map/overlays/maplibre`)
- `leaflet >= 1.9` (optional — required for `school-floor-map/overlays/leaflet`)

## Local Development

```bash
pnpm install          # install root + demo dependencies
pnpm build            # build library
cd demo && pnpm dev   # start demo dev server at http://localhost:5173
```

## License

MIT
