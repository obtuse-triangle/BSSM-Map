# school-floor-map

Interactive school floor plan React component with zoom/pan support.

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

## Peer Dependencies

- `react >= 18`
- `react-dom >= 18`
- `react-zoom-pan-pinch >= 3`

## Local Development

```bash
pnpm install          # install root + demo dependencies
pnpm build            # build library
cd demo && pnpm dev   # start demo dev server at http://localhost:5173
```

## License

MIT
