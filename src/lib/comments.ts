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
    targetMeta: JSON.stringify(normalizeTargetMeta(input.targetMeta)),
  };
}

export function assertBodyInput(input: Record<string, unknown>) {
  const body = String(input.body ?? "").trim();

  if (!body) throw new Error("Comment is required.");
  if (body.length > 2000) throw new Error("Comment is too long.");

  return { body };
}

function normalizeTargetMeta(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;

  return {
    tag: shortString(input.tag, 40),
    id: shortString(input.id, 120),
    classes: stringArray(input.classes, 12, 80),
    role: shortString(input.role, 80),
    ariaLabel: shortString(input.ariaLabel, 160),
    name: shortString(input.name, 120),
    type: shortString(input.type, 60),
    href: shortString(input.href, 240),
    path: shortString(input.path, 500),
    depth: boundedNumber(input.depth, 0, 80),
    stableAncestor: normalizeAncestor(input.stableAncestor),
    hierarchy: Array.isArray(input.hierarchy)
      ? input.hierarchy.slice(0, 12).map((item): Record<string, unknown> => normalizeHierarchyItem(item))
      : [],
    interactionPath: Array.isArray(input.interactionPath)
      ? input.interactionPath.slice(0, 5).map((item): Record<string, unknown> => normalizeInteractionStep(item))
      : [],
    ancestors: Array.isArray(input.ancestors)
      ? input.ancestors.slice(0, 5).map((item): Record<string, unknown> => normalizeAncestor(item))
      : [],
  };
}

function normalizeAncestor(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  return {
    tag: shortString(input.tag, 40),
    id: shortString(input.id, 120),
    classes: stringArray(input.classes, 8, 80),
    role: shortString(input.role, 80),
  };
}

function normalizeHierarchyItem(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  return {
    tag: shortString(input.tag, 40),
    id: shortString(input.id, 120),
    classes: stringArray(input.classes, 6, 80),
    role: shortString(input.role, 80),
    ariaLabel: shortString(input.ariaLabel, 160),
    index: boundedNumber(input.index, 1, 200),
    text: shortString(input.text, 80),
  };
}

function normalizeInteractionStep(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  return {
    selector: shortString(input.selector, 500),
    xpath: shortString(input.xpath, 500),
    textSnippet: shortString(input.textSnippet, 160),
    targetMeta: normalizeTargetMeta(input.targetMeta),
  };
}

function boundedNumber(value: unknown, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function shortString(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function stringArray(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => shortString(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}
