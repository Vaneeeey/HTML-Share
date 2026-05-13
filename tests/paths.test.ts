import { describe, expect, it } from "vitest";
import { normalizeRelativePath, resolveUploadPath } from "@/lib/paths";

describe("upload paths", () => {
  it("normalizes browser and archive paths", () => {
    expect(normalizeRelativePath("/folder//index.html")).toBe("folder/index.html");
    expect(normalizeRelativePath("folder\\asset.css")).toBe("folder/asset.css");
  });

  it("rejects paths escaping the upload directory", () => {
    expect(() => resolveUploadPath("page-1", "../secret")).toThrow("Invalid upload path");
  });
});
