import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "data/bssm": "src/data/bssm.ts",
    "data/campus": "src/data/campus.ts",
    "data/campus-wgs84": "src/data/campus-wgs84.ts",
    "data/school-outline": "src/data/school-outline.ts",
    "overlays/maplibre": "src/overlays/maplibre.ts",
    "overlays/leaflet": "src/overlays/leaflet.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ["react", "react-dom", "react-zoom-pan-pinch", "maplibre-gl", "leaflet"],
  treeshake: true,
});
