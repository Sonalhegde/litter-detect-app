import { describe, expect, it } from "vitest";

import { documentationTopics } from "./DocumentationCenter";

describe("BlueSentinel in-application documentation", () => {
  it("contains the required architecture and security documentation destinations", () => {
    const ids = documentationTopics.map((topic) => topic.id);
    expect(ids).toContain("architecture");
    expect(ids).toContain("security");
    expect(ids).toContain("metrics");
    expect(ids).toContain("limitations");
  });

  it("keeps documentation descriptions self-contained instead of linking readers to the repository", () => {
    expect(documentationTopics.every((topic) => !topic.summary.includes("github.com"))).toBe(true);
  });
});
