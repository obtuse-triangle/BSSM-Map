import { FloorMap, bssmFloorMap } from "school-floor-map";

function App() {
  return (
    <div style={{ height: "100dvh", minHeight: "100vh", width: "100vw" }}>
      <FloorMap
        data={bssmFloorMap}
        onPlaceClick={(element, floorKey) => {
          console.log(`Clicked ${element.name} on floor ${floorKey}`);
        }}
      />
    </div>
  );
}

export default App;
