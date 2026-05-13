import { describe, expect, it } from "vitest";
import { assertCommentInput, normalizeStatus } from "@/lib/comments";

describe("comment validation", () => {
  it("requires a body and target", () => {
    expect(() => assertCommentInput({ authorName: "Lin", selector: "h1" })).toThrow(
      "Comment is required.",
    );
    expect(() => assertCommentInput({ authorName: "Lin", body: "Fix this" })).toThrow(
      "A target element is required.",
    );
  });

  it("does not trust a submitted author name", () => {
    expect(assertCommentInput({ authorName: "Fake", body: "Fix", selector: "h1" })).not.toHaveProperty(
      "authorName",
    );
  });

  it("normalizes status values", () => {
    expect(normalizeStatus("resolved")).toBe("resolved");
    expect(normalizeStatus("other")).toBe("open");
  });
});
