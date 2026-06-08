# Map Overlay React Components and Documentation

## TL;DR
> **Summary**: Add first-class React component surfaces for map overlay usage while preserving the existing map-library-agnostic core. Ship typed WGS84 overlay data/helpers, optional MapLibre and Leaflet component entry points, selection callbacks, TDD coverage, and full documentation.
> **Deliverables**:
> - WGS84 campus data package export
> - Shared overlay types/helpers with `onFeatureSelect(feature, context)` contract
> - `MapLibreCampusOverlay` React component subpath export
> - `LeafletCampusOverlay` React component subpath export
> - README overlay section, dedicated overlay guide, demo walkthrough, and accuracy caveats
> - CI test step and package export verification
> **Effort**: Large
> **Parallel**: YES - 5 waves, with parallel work only in Waves 3 and 4
> **Critical Path**: Task 1 -> Task 2 -> Tasks 3/4 -> Tasks 5/6 -> Task 7 -> Final Verification

## Context
### Original Request
User requested in Korean: "그리고 해당 라이브러리가 지도 오버레이 형식으로 사용할 수 있도록 수정을 가해야 하고. 문서화도 진행해야 해. 관련 플랜을 작성하도록 해."

### Interview Summary
- Overlay support choice: both MapLibre and Leaflet.
- Documentation scope: full docs, including README, separate guide, demo walkthrough, and accuracy caveats.
- Test strategy: TDD.
- Additional requirement: when a user selects a place on the rendered map overlay, the library must pass the selected place data through a callback-like API.
- Architecture clarification: existing floor maps are React components, so overlay support should also be exposed as React component APIs rather than docs-only snippets.

### Metis Review (gaps addressed)
- Metis identified "adapter" ambiguity. Resolved: adapters are first-class React component subpath exports.
- Metis warned not to add map engines as mandatory core dependencies. Resolved: use separate optional subpath exports and optional peers.
- Metis warned not to port BSSM-specific demo code wholesale. Resolved: extract general overlay behavior only; keep BSSM-specific tiles/labels in demo/docs.
- Metis warned about local vs WGS84 type mismatch. Resolved: overlay components accept WGS84 feature collections, not local `CampusFeatureCollection`.
- Metis warned about existing pipeline stability. Resolved: do not rewrite georeference scripts unless a failing test proves a packaging-only change is required.

## Work Objectives
### Core Objective
Make `school-floor-map` usable as a React map overlay library: consumers can render the campus overlay on MapLibre or Leaflet, select a feature, and receive selected place data via callback.

### Deliverables
- `src/data/campus-wgs84.ts` export sourced from an overlay-ready WGS84 GeoJSON asset.
- Shared overlay schemas/types/helpers for WGS84 data, floor filtering, category styling, feature bounds, and callback context.
- `src/overlays/maplibre/MapLibreCampusOverlay.tsx` component exported from `school-floor-map/overlays/maplibre`.
- `src/overlays/leaflet/LeafletCampusOverlay.tsx` component exported from `school-floor-map/overlays/leaflet`.
- Package export map and tsup entries for new data and overlay subpaths.
- README and dedicated guide updates for install, imports, props, callback examples, MapLibre usage, Leaflet usage, demo walkthrough, and accuracy warnings.
- CI workflow update to run tests before demo build.

### Public Overlay Component API (fixed contract)
Both `MapLibreCampusOverlay` and `LeafletCampusOverlay` must expose this shared base contract where possible:

```ts
type OverlayLngLat = [lng: number, lat: number];

interface OverlaySelectionContext {
  levelId: string;
  lngLat: OverlayLngLat;
  adapter: "maplibre" | "leaflet";
  sourceEvent?: unknown;
}

interface CampusOverlayBaseProps {
  data: CampusWgs84FeatureCollection;
  initialLevel?: string | number;
  selectedLevel?: string;
  onLevelChange?: (levelId: string) => void;
  onFeatureSelect?: (
    feature: CampusWgs84Feature,
    context: OverlaySelectionContext,
  ) => void;
  className?: string;
  style?: React.CSSProperties;
  showLevelSelector?: boolean;
  showLegend?: boolean;
  categoryStyles?: Partial<Record<CampusFeatureCategory, OverlayCategoryStyle>>;
}

interface MapLibreCampusOverlayProps extends CampusOverlayBaseProps {
  mapOptions?: Omit<maplibregl.MapOptions, "container">;
  rasterStyle?: "osm" | "none";
}

interface LeafletCampusOverlayProps extends CampusOverlayBaseProps {
  mapOptions?: L.MapOptions;
  tileLayer?: {
    urlTemplate: string;
    options?: L.TileLayerOptions;
  } | false;
}
```

Level behavior is identical for both adapters: if `selectedLevel` is provided, the component is controlled and must call `onLevelChange` without mutating internal level state; otherwise it initializes from `initialLevel` or the first available level and manages level state internally.

### Definition of Done (verifiable conditions with commands)
- `pnpm test` passes with all existing tests plus new overlay tests.
- `pnpm lint` passes with no TypeScript errors.
- `pnpm build` emits `dist/data/campus-wgs84.*`, `dist/overlays/maplibre.*`, and `dist/overlays/leaflet.*`.
- `node -e "import('./dist/data/campus-wgs84.mjs').then(m=>console.log(m.campusWgs84FeatureCollection.type))"` prints `FeatureCollection`.
- `node -e "import('./dist/overlays/maplibre.mjs').then(m=>console.log(typeof m.MapLibreCampusOverlay))"` prints `function`.
- `node -e "import('./dist/overlays/leaflet.mjs').then(m=>console.log(typeof m.LeafletCampusOverlay))"` prints `function`.
- `pnpm --dir demo build` passes after the demo imports the library overlay component.

### Must Have
- TDD: each new public data/helper/component contract has a failing test before implementation.
- Place selection callback contract: `onFeatureSelect(feature, context)`.
- `feature` must be the selected WGS84 campus feature; `context` must include `levelId`, `lngLat`, `adapter`, and source event metadata if available.
- Both adapters must support floor/level switching and feature selection.
- Root import must remain usable without installing MapLibre or Leaflet.
- MapLibre/Leaflet dependencies must be optional peers or demo/dev dependencies, not mandatory core dependencies.
- Docs must clearly state overlay is schematic, not survey-grade or safety-critical.

### Must NOT Have
- Do not refactor `FloorMap` or existing `CampusMap` floorplan rendering.
- Do not rewrite `scripts/compute-georeference.mjs`, `scripts/compute-floor-anchors.mjs`, or `scripts/export-wgs84-geojson.mjs` unless a packaging test proves a minimal data-export adjustment is required.
- Do not import `maplibre-gl` or `leaflet` from `src/index.ts`.
- Do not put BSSM-specific tile URLs, hardcoded anchor candidates, or demo-only state into library overlay components.
- Do not change the existing local-coordinate `CampusFeatureCollection` schema for this work.
- Do not add unrelated `FloorMap` tests unless implementation touches `FloorMap`, which this plan forbids.

## Verification Strategy
> ZERO HUMAN INTERVENTION for task verification - all task acceptance checks are agent-executed. The final verification wave still presents consolidated results and waits for the user's explicit okay because that is the project completion gate mandated for this workflow, not a task-level test step.
- Test decision: TDD with Vitest + jsdom + Testing Library.
- QA policy: Every task has agent-executed scenarios.
- Evidence: `.omo/evidence/task-{N}-{slug}.{ext}`.

## Execution Strategy
### Parallel Execution Waves
> Target: 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks for max parallelism.

Wave 1: Task 1 foundation contracts.
Wave 2: Task 2 packaging/export wiring.
Wave 3: Tasks 3-4 map-engine React components in parallel after shared contracts exist.
Wave 4: Tasks 5-6 demo and docs in parallel after component APIs stabilize.
Wave 5: Task 7 CI/package verification and final cleanup.

### Dependency Matrix (full, all tasks)
- Task 1: blocks Tasks 2, 3, 4, 5, 6, 7.
- Task 2: blocked by Task 1; blocks Tasks 3, 4, 5, 6, 7.
- Task 3: blocked by Tasks 1-2; blocks Tasks 5-7.
- Task 4: blocked by Tasks 1-2; blocks Tasks 5-7.
- Task 5: blocked by Tasks 3-4; blocks Task 7.
- Task 6: blocked by Tasks 2-4; blocks Task 7.
- Task 7: blocked by Tasks 1-6.

### Agent Dispatch Summary (wave -> task count -> categories)
- Wave 1 -> 1 task -> `unspecified-high`.
- Wave 2 -> 1 task -> `quick`.
- Wave 3 -> 2 tasks -> `visual-engineering`, `visual-engineering`.
- Wave 4 -> 2 tasks -> `visual-engineering`, `writing`.
- Wave 5 -> 1 task -> `unspecified-high`.

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [x] 1. Define WGS84 Overlay Data and Shared Contracts

  **What to do**: Add failing tests first for a new overlay contract module, then implement shared WGS84 data/types/helpers. Create `src/schemas/campusWgs84Geojson.ts` or `src/overlays/types.ts` with a WGS84 feature collection type that mirrors existing campus feature properties but allows `metadata.coordinateSystem: "WGS84"`. Add `src/data/campus-wgs84.ts` that exports `campusWgs84FeatureCollection` from a checked-in WGS84 GeoJSON asset. Add pure helpers such as `filterFeaturesByLevel(data, levelId)`, `getAvailableLevels(data)`, `getFeatureLngLat(feature)`, `getFeatureBounds(features)`, and shared category style constants. Define `OverlaySelectionContext` with `levelId`, `lngLat`, `adapter: "maplibre" | "leaflet"`, and optional `sourceEvent`.
  **Must NOT do**: Do not modify local `campusFeatureCollectionSchema`; do not add map engine imports; do not rewrite georeference scripts.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: Type/schema/data contract work affects public API and package exports.
  - Skills: [] - No special skill required.
  - Omitted: [`visual-engineering`] - No UI rendering in this task.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: Tasks 2-7 | Blocked By: none

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `src/schemas/campusGeojson.ts:1` - Existing Zod schema and inferred type style.
  - Pattern: `src/data/campus.ts:1` - Existing JSON data export pattern.
  - Pattern: `test/data/geojsonToFloorMap.test.ts:1` - Existing arrange-act-assert tests for pure data helpers.
  - Data source: `demo/public/campus-wgs84.geojson` - Current overlay-ready WGS84 data used by demo.
  - Constraint: `src/components/CampusMap.tsx:227` - Existing overlay placeholder proves current mode is not usable.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Add tests that initially fail for WGS84 schema validation, level filtering, bounds calculation, and representative feature centroid/lngLat extraction.
  - [ ] `pnpm vitest run test/overlays` passes after implementation.
  - [ ] `pnpm vitest run test/data` passes with existing data tests unchanged.
  - [ ] `pnpm lint` reports no TypeScript errors for new WGS84 types.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: WGS84 data validates and filters by level
    Tool: Bash
    Steps: Run `pnpm vitest run test/overlays/overlayData.test.ts --reporter=dot`.
    Expected: Tests prove WGS84 metadata is accepted, floor 1 filtering returns only level_id "1", and empty level returns empty array.
    Evidence: .omo/evidence/task-1-overlay-data.txt

  Scenario: Invalid/local data is rejected by overlay contract
    Tool: Bash
    Steps: Run the same test file with a case passing `metadata.coordinateSystem: "local"` into the WGS84 validator/helper.
    Expected: Test fails before implementation and passes after implementation by rejecting local-coordinate data for overlay components.
    Evidence: .omo/evidence/task-1-overlay-data-error.txt
  ```

  **Commit**: YES | Message: `feat(overlay): add wgs84 overlay contracts` | Files: [`src/schemas/campusWgs84Geojson.ts`, `src/overlays/types.ts`, `src/overlays/shared.ts`, `src/data/campus-wgs84.ts`, `test/overlays/overlayData.test.ts`]

- [x] 2. Add Package Subpath Exports and Optional Peer Metadata

  **What to do**: Add failing package/export tests first, then update `tsup.config.ts` and `package.json`. Add build entry for `data/campus-wgs84` now. Add package export-map reservations for `overlays/maplibre` and `overlays/leaflet` only after creating minimal entry files that export shared types/constants and TODO-free named placeholders are forbidden; if real components are not implemented yet, Task 2 must limit executable import checks to root and `data/campus-wgs84` only. Add `maplibre-gl` and `leaflet` as optional peer dependencies using `peerDependenciesMeta`, while keeping them external in tsup. Add dev dependencies only if TypeScript build needs them. Ensure root `src/index.ts` exports only shared overlay types/helpers and does not import map engines.
  **Must NOT do**: Do not export map-specific components from root `.` if that makes root import require MapLibre or Leaflet.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: Config/package edits are bounded but need precision.
  - Skills: [] - No special skill required.
  - Omitted: [`writing`] - Documentation handled later.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: Tasks 3-7 | Blocked By: Task 1

  **References**:
  - Pattern: `package.json:8` - Current exports map for root and data subpaths.
  - Pattern: `package.json:34` - Current peer dependency location.
  - Pattern: `tsup.config.ts:4` - Current entry map.
  - Pattern: `tsup.config.ts:14` - Current external dependency list.
  - Pattern: `src/index.ts:1` - Current public root re-export style.

  **Acceptance Criteria**:
  - [ ] Add export smoke tests or build verification script that initially fails for missing subpaths.
  - [ ] `pnpm build` emits `dist/data/campus-wgs84.*` and keeps root output map-engine agnostic.
  - [ ] Root import verification succeeds without requiring map engines: `node -e "import('./dist/index.mjs').then(()=>console.log('root-ok'))"` prints `root-ok`.
  - [ ] WGS84 data subpath verification succeeds: `node -e "import('./dist/data/campus-wgs84.mjs').then(m=>console.log(m.campusWgs84FeatureCollection.type))"` prints `FeatureCollection`.
  - [ ] MapLibre/Leaflet component subpath function import verification is explicitly deferred to Task 7 after Tasks 3-4 implement those components.

  **QA Scenarios**:
  ```
  Scenario: Package subpaths resolve after build
    Tool: Bash
    Steps: Run `pnpm build` then the `node -e` import commands for root and `data/campus-wgs84` only.
    Expected: Root import prints `root-ok`; WGS84 data import prints `FeatureCollection`; no overlay component function checks run in this task.
    Evidence: .omo/evidence/task-2-package-exports.txt

  Scenario: Root bundle stays map-engine agnostic
    Tool: Bash
    Steps: Search built root output and source root with `rg "maplibre|leaflet" src/index.ts dist/index.mjs dist/index.js`.
    Expected: No map engine imports appear in root entry output.
    Evidence: .omo/evidence/task-2-root-agnostic.txt
  ```

  **Commit**: YES | Message: `build(overlay): expose optional overlay subpaths` | Files: [`package.json`, `tsup.config.ts`, `src/index.ts`, `test/package-exports.test.ts`]

- [x] 3. Implement `MapLibreCampusOverlay` React Component

  **What to do**: Add failing jsdom/Testing Library tests first for component rendering, level filtering, controlled/uncontrolled level behavior, and selection callback behavior with mocked `maplibre-gl`. Implement `src/overlays/maplibre/MapLibreCampusOverlay.tsx` and `src/overlays/maplibre.ts` exactly according to the fixed Public Overlay Component API section. Use shared helpers from Task 1. On feature click, call `onFeatureSelect(feature, { levelId, lngLat, adapter: "maplibre", sourceEvent })`. Reuse general layer concepts from the demo but not demo-specific tile URLs or anchor constants.
  **Must NOT do**: Do not import MapLibre into root; do not hardcode BSSM-only view modes; do not move demo monolith into library.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` - Reason: React component + map UI behavior.
  - Skills: [] - No special skill required.
  - Omitted: [`deep`] - Architecture already decided.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: Tasks 5-7 | Blocked By: Tasks 1-2

  **References**:
  - Pattern: `src/components/CampusMap.tsx:215` - Existing React component prop defaults and level selector behavior.
  - Pattern: `src/components/CampusMap.tsx:296` - Existing feature click callback pattern.
  - Pattern: `test/components/CampusMap.test.tsx:130` - Existing callback test style.
  - Reference implementation: `demo/src/App.tsx:476` - Existing floor change source data swap pattern.
  - Reference implementation: `demo/src/App.tsx:436` - Existing cursor behavior for clickable map layer.

  **Acceptance Criteria**:
  - [ ] Tests first prove component mounts with a mocked MapLibre constructor and loads level-filtered GeoJSON into a source.
  - [ ] Tests prove clicking/selecting a feature calls `onFeatureSelect` with selected feature and `adapter: "maplibre"` context.
  - [ ] Tests prove controlled `selectedLevel` uses props and calls `onLevelChange`, while uncontrolled mode manages internal state from `initialLevel`.
  - [ ] `pnpm vitest run test/overlays/MapLibreCampusOverlay.test.tsx` passes.
  - [ ] `pnpm build` succeeds with `maplibre-gl` externalized.

  **QA Scenarios**:
  ```
  Scenario: MapLibre overlay renders level-filtered data
    Tool: Bash
    Steps: Run `pnpm vitest run test/overlays/MapLibreCampusOverlay.test.tsx --reporter=dot`.
    Expected: Mock map source receives only selected level features and component renders level selector when enabled.
    Evidence: .omo/evidence/task-3-maplibre-render.txt

  Scenario: MapLibre feature selection emits callback data
    Tool: Bash
    Steps: In the same test file, simulate the registered `campus-fill` click handler with a feature payload and lngLat.
    Expected: `onFeatureSelect` is called once with the raw selected feature and context containing `adapter: "maplibre"`, `levelId`, and `lngLat`.
    Evidence: .omo/evidence/task-3-maplibre-callback.txt
  ```

  **Commit**: YES | Message: `feat(overlay): add maplibre campus component` | Files: [`src/overlays/maplibre.ts`, `src/overlays/maplibre/MapLibreCampusOverlay.tsx`, `test/overlays/MapLibreCampusOverlay.test.tsx`]

- [x] 4. Implement `LeafletCampusOverlay` React Component

  **What to do**: Add failing jsdom/Testing Library tests first using a mocked `leaflet` module. Implement `src/overlays/leaflet/LeafletCampusOverlay.tsx` and `src/overlays/leaflet.ts` exactly according to the fixed Public Overlay Component API section. Render WGS84 polygons through Leaflet GeoJSON layers. On feature click, call `onFeatureSelect(feature, { levelId, lngLat, adapter: "leaflet", sourceEvent })`.
  **Must NOT do**: Do not invent a separate callback contract; do not require Leaflet CSS injection from the library; document CSS requirement later.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` - Reason: React component + map UI behavior.
  - Skills: [] - No special skill required.
  - Omitted: [`librarian`] - Use Leaflet docs only if implementer lacks API certainty; plan already defines behavior.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: Tasks 5-7 | Blocked By: Tasks 1-2

  **References**:
  - Pattern: `src/components/CampusMap.tsx:321` - Existing component render structure with selector/legend/canvas.
  - Pattern: `test/components/CampusMap.test.tsx:115` - Existing component test organization.
  - Contract: Task 1 shared helpers/types - Must use identical `OverlaySelectionContext` callback shape.
  - Constraint: `demo/package.json:13` - Demo currently has MapLibre only; Leaflet is new and must remain optional.

  **Acceptance Criteria**:
  - [ ] Tests first prove component creates a Leaflet map and GeoJSON layer using selected level data.
  - [ ] Tests prove Leaflet feature click emits the same callback shape as MapLibre with `adapter: "leaflet"`.
  - [ ] Tests prove controlled `selectedLevel` uses props and calls `onLevelChange`, while uncontrolled mode manages internal state from `initialLevel`.
  - [ ] `pnpm vitest run test/overlays/LeafletCampusOverlay.test.tsx` passes.
  - [ ] `pnpm build` succeeds with `leaflet` externalized.

  **QA Scenarios**:
  ```
  Scenario: Leaflet overlay renders level-filtered GeoJSON
    Tool: Bash
    Steps: Run `pnpm vitest run test/overlays/LeafletCampusOverlay.test.tsx --reporter=dot`.
    Expected: Mock Leaflet `geoJSON` receives only selected floor features and updates when level changes.
    Evidence: .omo/evidence/task-4-leaflet-render.txt

  Scenario: Leaflet feature selection emits callback data
    Tool: Bash
    Steps: In the same test file, invoke the mocked per-feature click handler with a lat/lng event.
    Expected: `onFeatureSelect` is called once with selected feature and context containing `adapter: "leaflet"`, `levelId`, and `[lng, lat]`.
    Evidence: .omo/evidence/task-4-leaflet-callback.txt
  ```

  **Commit**: YES | Message: `feat(overlay): add leaflet campus component` | Files: [`src/overlays/leaflet.ts`, `src/overlays/leaflet/LeafletCampusOverlay.tsx`, `test/overlays/LeafletCampusOverlay.test.tsx`]

- [ ] 5. Update Demo to Consume Library Overlay Component

  **What to do**: Add a demo build/type test first if missing, then replace or wrap the current demo MapLibre overlay implementation with the exported `MapLibreCampusOverlay` from `school-floor-map/overlays/maplibre`. Keep demo-specific tile choices, labels, and Korean UI outside the library component through props. Display selected place data from the callback in the demo UI or popup so the callback requirement is visibly exercised.
  **Must NOT do**: Do not move the entire `demo/src/App.tsx` map implementation into the library; do not remove existing legacy floor map and campus outline tabs.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` - Reason: Demo UI integration with new component.
  - Skills: [] - No special skill required.
  - Omitted: [`quick`] - Demo file is large and fragile.

  **Parallelization**: Can Parallel: YES | Wave 4 | Blocks: Task 7 | Blocked By: Tasks 3-4

  **References**:
  - Pattern: `demo/src/App.tsx:500` - Current demo map overlay UI return structure.
  - Pattern: `demo/src/App.tsx:476` - Existing selected floor data swap behavior to preserve via component props.
  - Pattern: `demo/package.json:6` - Demo build scripts.
  - Constraint: `demo/package.json:14` - Demo already has `maplibre-gl`; do not add Leaflet demo unless docs-only example is insufficient.

  **Acceptance Criteria**:
  - [ ] `pnpm --dir demo build` passes.
  - [ ] Demo imports `MapLibreCampusOverlay` from `school-floor-map/overlays/maplibre`.
  - [ ] Demo selection callback stores and displays selected feature name or popup data from library callback.
  - [ ] Existing demo tabs still compile: legacy floor map, campus outline, and map overlay.

  **QA Scenarios**:
  ```
  Scenario: Demo builds with library overlay component
    Tool: Bash
    Steps: Run `pnpm --dir demo build`.
    Expected: TypeScript and Vite build complete with no import/export errors.
    Evidence: .omo/evidence/task-5-demo-build.txt

  Scenario: Demo uses callback path instead of local-only selection state
    Tool: Bash
    Steps: Run `rg "onFeatureSelect|MapLibreCampusOverlay" demo/src/App.tsx`.
    Expected: Output shows `MapLibreCampusOverlay` import/use and an `onFeatureSelect` handler that receives selected feature data.
    Evidence: .omo/evidence/task-5-demo-callback.txt
  ```

  **Commit**: YES | Message: `demo: use library map overlay component` | Files: [`demo/src/App.tsx`, `demo/package.json`]

- [ ] 6. Write Full Overlay Documentation

  **What to do**: Update README and create a dedicated overlay guide. README must summarize install, imports, data export, component props, and callback usage. Add `docs/overlay-guide.md` with MapLibre example, Leaflet example, callback payload contract, styling/customization, WGS84 data export, demo walkthrough, and accuracy caveats. Include clear notes that `geojsonToFloorMapData` is lossy and for legacy `FloorMap` only. Mention Leaflet CSS requirement and optional peer dependency setup.
  **Must NOT do**: Do not promise GPS-precise/survey-grade positioning; do not document `CampusMap mode="overlay"` as the preferred API if new components replace the placeholder.

  **Recommended Agent Profile**:
  - Category: `writing` - Reason: Technical docs with examples and guardrails.
  - Skills: [] - No special skill required.
  - Omitted: [`visual-engineering`] - No UI implementation.

  **Parallelization**: Can Parallel: YES | Wave 4 | Blocks: Task 7 | Blocked By: Tasks 2-4

  **References**:
  - Pattern: `README.md` - Existing manual docs style with install, usage, props tables, data pipeline, and caveats.
  - Pattern: `README.md` Map Overlay Demo section - Existing overlay explanation to update, not duplicate.
  - API references: `src/overlays/maplibre.ts`, `src/overlays/leaflet.ts`, `src/overlays/types.ts` - New exports from Tasks 1, 3, 4.
  - Accuracy source: README overlay accuracy bands and per-floor residuals already documented.

  **Acceptance Criteria**:
  - [ ] README includes import examples for `school-floor-map/data/campus-wgs84`, `school-floor-map/overlays/maplibre`, and `school-floor-map/overlays/leaflet`.
  - [ ] README includes `onFeatureSelect={(feature, context) => ...}` example.
  - [ ] `docs/overlay-guide.md` exists and contains MapLibre, Leaflet, callback, demo walkthrough, and accuracy sections.
  - [ ] `rg "GPS-precise|turn-by-turn|safety-critical" README.md docs/overlay-guide.md` does not show unsupported positive claims.

  **QA Scenarios**:
  ```
  Scenario: Documentation includes both adapter examples and callback contract
    Tool: Bash
    Steps: Run `rg "MapLibreCampusOverlay|LeafletCampusOverlay|onFeatureSelect|OverlaySelectionContext" README.md docs/overlay-guide.md`.
    Expected: All four terms appear in meaningful usage examples or API sections.
    Evidence: .omo/evidence/task-6-docs-coverage.txt

  Scenario: Documentation preserves accuracy caveats
    Tool: Bash
    Steps: Run `rg "schematic|survey-grade|RMS|accuracy|safety-critical" README.md docs/overlay-guide.md`.
    Expected: Output includes warnings that overlay is schematic and not safety-critical or survey-grade.
    Evidence: .omo/evidence/task-6-docs-caveats.txt
  ```

  **Commit**: YES | Message: `docs: document map overlay components` | Files: [`README.md`, `docs/overlay-guide.md`, `demo/README.md`]

- [ ] 7. Add CI Test Gate and Final Package Verification

  **What to do**: Add `pnpm test` and `pnpm lint` to `.github/workflows/deploy-demo.yml` before build steps. Add any final package export smoke tests needed to verify root and subpath imports. Run full local verification and capture evidence.
  **Must NOT do**: Do not add coverage thresholds, matrix builds, release automation, or unrelated ESLint setup in this task.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: CI/package verification touches release confidence.
  - Skills: [] - No special skill required.
  - Omitted: [`writing`] - Docs already handled.

  **Parallelization**: Can Parallel: NO | Wave 5 | Blocks: Final Verification | Blocked By: Tasks 1-6

  **References**:
  - Pattern: `.github/workflows/deploy-demo.yml:32` - Existing install/build workflow location.
  - Pattern: `package.json:28` - Root scripts for build/lint/test.
  - Pattern: `demo/package.json:6` - Demo build script.

  **Acceptance Criteria**:
  - [ ] Workflow runs `pnpm test` and `pnpm lint` before `pnpm build`.
  - [ ] `pnpm test` passes.
  - [ ] `pnpm lint` passes.
  - [ ] `pnpm build` passes.
  - [ ] `pnpm --dir demo build` passes.
  - [ ] Built subpath import commands from Definition of Done pass.

  **QA Scenarios**:
  ```
  Scenario: Full local verification passes
    Tool: Bash
    Steps: Run `pnpm test && pnpm lint && pnpm build && pnpm --dir demo build`.
    Expected: All commands exit 0.
    Evidence: .omo/evidence/task-7-full-verification.txt

  Scenario: CI workflow contains test and lint gates before build
    Tool: Bash
    Steps: Run `python - <<'PY'\nfrom pathlib import Path\ns=Path('.github/workflows/deploy-demo.yml').read_text()\nprint(s.index('pnpm test') < s.index('pnpm build'))\nprint(s.index('pnpm lint') < s.index('pnpm build'))\nPY`.
    Expected: Both printed values are `True`.
    Evidence: .omo/evidence/task-7-ci-order.txt
  ```

  **Commit**: YES | Message: `ci: test overlay package before deploy` | Files: [`.github/workflows/deploy-demo.yml`, `test/package-exports.test.ts`]

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.
- [ ] F1. Plan Compliance Audit — oracle
- [ ] F2. Code Quality Review — unspecified-high
- [ ] F3. Real Manual QA — unspecified-high (+ playwright if UI)
- [ ] F4. Scope Fidelity Check — deep

## Commit Strategy
- Prefer one commit per TODO task using the exact commit messages listed in each task.
- Do not commit generated evidence files unless repository convention already tracks `.omo/evidence` for this project.
- If Task 3 and Task 4 are executed in parallel, merge through Task 2 first to avoid package export conflicts.
- Do not squash implementation commits unless user explicitly requests it.

## Success Criteria
- Consumers can import overlay-ready WGS84 data from `school-floor-map/data/campus-wgs84`.
- Consumers can render a MapLibre overlay through `school-floor-map/overlays/maplibre`.
- Consumers can render a Leaflet overlay through `school-floor-map/overlays/leaflet`.
- Selecting a room/place on either overlay calls `onFeatureSelect(feature, context)` with the selected feature and adapter-specific context.
- Existing `FloorMap` and `CampusMap` floorplan behavior remains unchanged.
- The root package import stays free of mandatory map-engine imports.
- README and guide tell users how to install optional map dependencies, use both adapters, handle selection callbacks, and understand overlay accuracy limitations.
