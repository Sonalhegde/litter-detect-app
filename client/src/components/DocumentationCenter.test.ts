import { describe, expect, it } from "vitest";
import { documentationTopics } from "./DocumentationCenter";

describe("Sentinel documentation", () => {
  it("contains the core documentation and credits sections", () => {
    const ids = documentationTopics.map((topic) => topic.id);
    expect(ids).toEqual(["overview", "how-it-works", "model", "api", "limitations", "credits"]);
  });

  it("uses human-readable labels", () => {
    expect(documentationTopics.every((topic) => topic.label.length > 0)).toBe(true);
  });
});
