import { describe, expect, it } from "vitest";
import { assertCommentInput, normalizeStatus } from "@/lib/comments";

describe("comment validation", () => {
  it("requires a nickname, body, and target", () => {
    expect(() => assertCommentInput({ body: "Fix this", selector: "h1" })).toThrow(
      "Nickname is required.",
    );
    expect(() => assertCommentInput({ authorName: "Lin", selector: "h1" })).toThrow(
      "Comment is required.",
    );
    expect(() => assertCommentInput({ authorName: "Lin", body: "Fix this" })).toThrow(
      "A target element is required.",
    );
  });

  it("normalizes status values", () => {
    expect(normalizeStatus("resolved")).toBe("resolved");
    expect(normalizeStatus("other")).toBe("open");
  });
});
