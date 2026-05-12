export interface FloorElement {
  id: number;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  interactive: boolean | null;
}

export interface Floor {
  label: string;
  elements: FloorElement[];
}

export interface FloorMapData {
  version: number;
  school: string;
  floors: Record<string, Floor>;
}

export interface FloorMapProps {
  data: FloorMapData;
  onPlaceClick?: (element: FloorElement, floorKey: string) => void;
  initialFloor?: string;
  className?: string;
  showZoomControls?: boolean;
  zoomMin?: number;
  zoomMax?: number;
  initialScale?: number;
}