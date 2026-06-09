import "@testing-library/jest-dom/vitest";

// react-zoom-pan-pinch uses ResizeObserver which is not available in jsdom
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

// jsdom doesn't implement SVGElement.prototype.getBBox
if (typeof SVGElement !== "undefined") {
  SVGElement.prototype.getBBox = () => ({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
}
