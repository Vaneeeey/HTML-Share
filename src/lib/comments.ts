export function normalizeStatus(value: unknown) {
  return value === "resolved" ? "resolved" : "open";
}

export function assertCommentInput(input: Record<string, unknown>) {
  const body = String(input.body ?? "").trim();
  const selector = String(input.selector ?? "").trim();
  const xpath = String(input.xpath ?? "").trim();
  const textSnippet = String(input.textSnippet ?? "").trim().slice(0, 240);

  if (!body) throw new Error("Comment is required.");
  if (body.length > 2000) throw new Error("Comment is too long.");
  if (!selector && !xpath) throw new Error("A target element is required.");

  return {
    body,
    selector,
    xpath,
    textSnippet,
    rect: JSON.stringify(input.rect ?? {}),
    viewport: JSON.stringify(input.viewport ?? {}),
  };
}
