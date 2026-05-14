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

  it("stores a bounded target fingerprint for dynamic element lookup", () => {
    const input = assertCommentInput({
      body: "Fix",
      selector: "button",
      targetMeta: {
        tag: "button",
        id: "modal-submit",
        classes: ["primary", "large", "x".repeat(100)],
        role: "button",
        ariaLabel: "Submit",
        path: "main > div#dialog > button#modal-submit",
        hierarchy: [
          { tag: "main", id: "root", index: 1, text: "Modal content Submit" },
          { tag: "div", id: "dialog", role: "dialog", index: 1, text: "Modal content Submit" },
          { tag: "button", id: "modal-submit", classes: ["primary"], index: 1, text: "Submit" },
        ],
        interactionPath: [
          {
            selector: "button#open-modal",
            xpath: "/html[1]/body[1]/button[1]",
            textSnippet: "Open modal",
            targetMeta: { tag: "button", id: "open-modal" },
          },
        ],
        ancestors: [
          { tag: "div", id: "dialog", classes: ["modal"], role: "dialog" },
          { tag: "section", classes: ["screen"] },
        ],
      },
    });

    const targetMeta = JSON.parse(input.targetMeta);
    expect(targetMeta).toMatchObject({
      tag: "button",
      id: "modal-submit",
      classes: ["primary", "large", "x".repeat(80)],
      role: "button",
      ariaLabel: "Submit",
      path: "main > div#dialog > button#modal-submit",
    });
    expect(targetMeta.hierarchy).toHaveLength(3);
    expect(targetMeta.interactionPath[0]).toMatchObject({ selector: "button#open-modal", textSnippet: "Open modal" });
    expect(targetMeta.ancestors[0]).toMatchObject({ tag: "div", id: "dialog", classes: ["modal"], role: "dialog" });
  });

  it("normalizes status values", () => {
    expect(normalizeStatus("resolved")).toBe("resolved");
    expect(normalizeStatus("other")).toBe("open");
  });
});
