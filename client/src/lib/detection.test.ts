import { describe, expect, it } from "vitest";
import { averageConfidence, formatDuration, formatPercent, maxConfidence, type Detection } from "./detection";

const detections: Detection[] = [
  { id: 1, className: "litter", confidence: 0.9, bbox: { x1: 0, y1: 0, x2: 10, y2: 10 } },
  { id: 2, className: "litter", confidence: 0.6, bbox: { x1: 1, y1: 1, x2: 8, y2: 8 } },
];

describe("detection formatting", () => {
  it("calculates average confidence and handles an empty result", () => {
    expect(averageConfidence(detections)).toBeCloseTo(0.75);
    expect(averageConfidence([])).toBe(0);
    expect(maxConfidence(detections)).toBe(0.9);
    expect(maxConfidence([])).toBe(0);
  });

  it("formats user-facing metrics consistently", () => {
    expect(formatPercent(0.754)).toBe("75%");
    expect(formatDuration(0.4321)).toBe("0.43s");
    expect(formatDuration(12.345)).toBe("12.3s");
  });
});
