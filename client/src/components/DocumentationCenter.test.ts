import { describe, expect, it } from "vitest";
import { documentationTopics } from "./DocumentationCenter";

describe("Sentinel documentation topics", () => {
  it("contains all seven sections in order", () => {
    const ids = documentationTopics.map((t) => t.id);
    expect(ids).toEqual([
      "overview",
      "how-it-works",
      "model",
      "dataset",
      "api",
      "limitations",
      "credits",
    ]);
  });

  it("every topic has a non-empty label", () => {
    expect(documentationTopics.every((t) => t.label.length > 0)).toBe(true);
  });
});
