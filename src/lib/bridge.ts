export function injectedBridgeScript() {
  return String.raw`
(() => {
  if (window.__htmlShareBridgeReady) return;
  window.__htmlShareBridgeReady = true;

  let commentMode = false;
  let hoveredElement = null;
  let lockedElement = null;
  let commentsCache = [];
  let pendingLocateComment = null;
  let pendingLocateOptions = {};
  let rerenderTimer = null;
  let lastSafeInteractions = [];
  let replayingInteractions = false;
  const markers = new Map();

  const layer = document.createElement("div");
  layer.setAttribute("data-html-share-layer", "true");
  Object.assign(layer.style, {
    position: "absolute",
    inset: "0",
    pointerEvents: "none",
    zIndex: "2147483647",
  });

  const hoverBox = document.createElement("div");
  hoverBox.className = "html-share-selection html-share-selection-hover";
  const lockedBox = document.createElement("div");
  lockedBox.className = "html-share-selection html-share-selection-locked";

  const cursorSvg = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='34' height='34' viewBox='0 0 34 34'%3E%3Cpath d='M17 5.5c-6.1 0-11 4.2-11 9.4 0 2.8 1.4 5.3 3.7 7l-.8 5.1 5.5-3.1c.8.2 1.7.3 2.6.3 6.1 0 11-4.2 11-9.3S23.1 5.5 17 5.5Z' fill='%233370ff' stroke='white' stroke-width='2.4' stroke-linejoin='round'/%3E%3Ccircle cx='12.8' cy='15' r='1.45' fill='white'/%3E%3Ccircle cx='17' cy='15' r='1.45' fill='white'/%3E%3Ccircle cx='21.2' cy='15' r='1.45' fill='white'/%3E%3C/svg%3E\") 9 9, crosshair";
  const style = document.createElement("style");
  style.textContent = [
    ".html-share-comment-mode, .html-share-comment-mode * { cursor: " + cursorSvg + " !important; }",
    ".html-share-selection { position: absolute; display: none; box-sizing: border-box; border: 1.5px solid #3370ff; background: rgba(51,112,255,.10); box-shadow: 0 0 0 1px rgba(255,255,255,.96), 0 8px 22px rgba(51,112,255,.16); border-radius: 6px; pointer-events: none; transition: left 80ms ease, top 80ms ease, width 80ms ease, height 80ms ease; }",
    ".html-share-selection::before { content: ''; position: absolute; inset: -4px; border: 1px solid rgba(51,112,255,.18); border-radius: 9px; }",
    ".html-share-selection-locked { background: rgba(51,112,255,.14); box-shadow: 0 0 0 1px rgba(255,255,255,.96), 0 0 0 4px rgba(51,112,255,.16), 0 14px 34px rgba(51,112,255,.20); }",
    ".html-share-marker { position: absolute; width: 36px; height: 36px; border: 0; background: transparent; pointer-events: auto; cursor: pointer !important; padding: 0; filter: none; transition: transform 140ms ease, opacity 140ms ease; }",
    ".html-share-marker:hover { transform: translateY(-1px) scale(1.04); filter: none; }",
    ".html-share-marker-shell { position: absolute; inset: 0; border-radius: 999px 999px 999px 9px; background: #fff; border: 1.5px solid #3370ff; display: grid; place-items: center; transform: rotate(-45deg); box-shadow: none; }",
    ".html-share-marker-shell::after { content: none; }",
    ".html-share-marker-avatar { width: 22px; height: 22px; border-radius: 999px; display: grid; place-items: center; color: white; background: #3370ff; font: 700 11px -apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC',sans-serif; transform: rotate(45deg); box-shadow: none; }",
    ".html-share-marker.resolved { opacity: .52; filter: grayscale(.95); }"
  ].join("\n");

  function ensureLayer() {
    if (!document.head.contains(style)) document.head.appendChild(style);
    if (document.body && !document.body.contains(layer)) {
      document.body.appendChild(layer);
      layer.appendChild(hoverBox);
      layer.appendChild(lockedBox);
    }
  }

  function cssPath(element) {
    if (!(element instanceof Element)) return "";
    const parts = [];
    let node = element;
    while (node && node.nodeType === Node.ELEMENT_NODE && node !== document.documentElement) {
      let selector = node.nodeName.toLowerCase();
      if (node.id) {
        selector += "#" + CSS.escape(node.id);
        parts.unshift(selector);
        break;
      }
      const parent = node.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((child) => child.nodeName === node.nodeName);
        if (siblings.length > 1) selector += ":nth-of-type(" + (siblings.indexOf(node) + 1) + ")";
      }
      parts.unshift(selector);
      node = parent;
    }
    return parts.join(" > ");
  }

  function xpathFor(element) {
    if (!(element instanceof Element)) return "";
    const segments = [];
    let node = element;
    while (node && node.nodeType === Node.ELEMENT_NODE) {
      let index = 1;
      let sibling = node.previousElementSibling;
      while (sibling) {
        if (sibling.nodeName === node.nodeName) index++;
        sibling = sibling.previousElementSibling;
      }
      segments.unshift(node.nodeName.toLowerCase() + "[" + index + "]");
      node = node.parentElement;
    }
    return "/" + segments.join("/");
  }

  function findByXPath(xpath) {
    if (!xpath) return null;
    try {
      return document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    } catch {
      return null;
    }
  }

  function normalizedText(element) {
    return (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
  }

  function attr(element, name) {
    return String(element.getAttribute(name) || "").trim();
  }

  function classTokens(element) {
    return Array.from(element.classList || []).filter(Boolean).slice(0, 12);
  }

  function siblingIndex(element) {
    if (!(element instanceof Element) || !element.parentElement) return 1;
    return Array.from(element.parentElement.children).filter((child) => child.tagName === element.tagName).indexOf(element) + 1;
  }

  function compactMeta(element) {
    if (!(element instanceof Element)) return {};
    const ancestors = [];
    let parent = element.parentElement;
    while (parent && parent !== document.documentElement && ancestors.length < 5) {
      ancestors.push({
        tag: parent.tagName.toLowerCase(),
        id: parent.id || "",
        classes: classTokens(parent).slice(0, 8),
        role: attr(parent, "role")
      });
      parent = parent.parentElement;
    }
    const hierarchy = [];
    let node = element;
    while (node && node.nodeType === Node.ELEMENT_NODE && node !== document.documentElement && hierarchy.length < 12) {
      hierarchy.unshift({
        tag: node.tagName.toLowerCase(),
        id: node.id || "",
        classes: classTokens(node).slice(0, 6),
        role: attr(node, "role"),
        ariaLabel: attr(node, "aria-label"),
        index: siblingIndex(node),
        text: normalizedText(node).slice(0, 80)
      });
      node = node.parentElement;
    }
    const stableAncestor = ancestors.find((ancestor) => ancestor.id || ancestor.role || ancestor.classes.length) || null;
    return {
      tag: element.tagName.toLowerCase(),
      id: element.id || "",
      classes: classTokens(element),
      role: attr(element, "role"),
      ariaLabel: attr(element, "aria-label"),
      name: attr(element, "name"),
      type: attr(element, "type"),
      href: element instanceof HTMLAnchorElement ? element.href : "",
      path: cssPath(element),
      depth: hierarchy.length,
      stableAncestor,
      hierarchy,
      ancestors
    };
  }

  function isVisibleElement(element) {
    if (!(element instanceof Element) || !element.isConnected) return false;
    if (element.closest("[data-html-share-layer]")) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0;
  }

  function textMatches(comment, element) {
    const snippet = String(comment.textSnippet || "").replace(/\s+/g, " ").trim();
    if (!snippet) return true;
    const text = normalizedText(element);
    if (!text) return false;
    return text.includes(snippet) || snippet.includes(text.slice(0, 120));
  }

  function lastSelectorTag(selector) {
    const lastPart = String(selector || "").split(">").pop()?.trim() || "";
    return lastPart.match(/^[a-zA-Z0-9-]+/)?.[0]?.toUpperCase() || "";
  }

  function expectedRect(comment) {
    const rect = comment.rect || {};
    const viewport = comment.viewport || {};
    const scaleX = viewport.width ? window.innerWidth / Number(viewport.width) : 1;
    const scaleY = viewport.height ? window.innerHeight / Number(viewport.height) : 1;
    return {
      x: Number(rect.x || 0) * scaleX,
      y: Number(rect.y || 0) * scaleY,
      width: Number(rect.width || 0) * scaleX,
      height: Number(rect.height || 0) * scaleY,
    };
  }

  function rectScore(comment, element) {
    const expected = expectedRect(comment);
    if (!expected.width && !expected.height) return 0;
    const rect = element.getBoundingClientRect();
    const distance = Math.abs(rect.left - expected.x) + Math.abs(rect.top - expected.y);
    const sizeDistance = Math.abs(rect.width - expected.width) + Math.abs(rect.height - expected.height);
    return Math.max(0, 30 - Math.min(30, (distance + sizeDistance * 0.35) / 18));
  }

  function addCandidate(candidates, element, reason) {
    if (element instanceof Element && !candidates.some((candidate) => candidate.element === element)) {
      candidates.push({ element, reasons: new Set([reason]) });
      return;
    }
    const candidate = candidates.find((item) => item.element === element);
    if (candidate) candidate.reasons.add(reason);
  }

  function addCandidatesBySelector(candidates, selector, reason) {
    if (!selector) return;
    try {
      document.querySelectorAll(selector).forEach((element) => addCandidate(candidates, element, reason));
    } catch {}
  }

  function addMetaCandidates(candidates, comment) {
    const meta = comment.targetMeta || {};
    if (meta.id) addCandidatesBySelector(candidates, "#" + CSS.escape(String(meta.id)), "meta");
    if (meta.role) addCandidatesBySelector(candidates, "[role='" + CSS.escape(String(meta.role)) + "']", "meta");
    if (meta.ariaLabel) addCandidatesBySelector(candidates, "[aria-label='" + CSS.escape(String(meta.ariaLabel)) + "']", "meta");
    if (meta.name) addCandidatesBySelector(candidates, "[name='" + CSS.escape(String(meta.name)) + "']", "meta");
    if (Array.isArray(meta.classes) && meta.classes.length) {
      const tag = /^[a-z0-9-]+$/i.test(String(meta.tag || "")) ? String(meta.tag) : "*";
      const selector = tag + meta.classes.slice(0, 3).map((item) => "." + CSS.escape(String(item))).join("");
      addCandidatesBySelector(candidates, selector, "meta");
    }
  }

  function overlapScore(saved, current, weight) {
    if (!Array.isArray(saved) || !saved.length || !Array.isArray(current) || !current.length) return 0;
    const currentSet = new Set(current);
    const matches = saved.filter((item) => currentSet.has(item)).length;
    return matches ? Math.min(weight, matches * (weight / Math.min(saved.length, 3))) : 0;
  }

  function currentAncestorMetas(element) {
    const currentAncestors = [];
    let parent = element.parentElement;
    while (parent && parent !== document.documentElement && currentAncestors.length < 8) {
      currentAncestors.push(compactMeta(parent));
      parent = parent.parentElement;
    }
    return currentAncestors;
  }

  function ancestorScore(savedAncestors, element) {
    if (!Array.isArray(savedAncestors) || !savedAncestors.length) return 0;
    let score = 0;
    const currentAncestors = currentAncestorMetas(element);
    savedAncestors.forEach((saved, index) => {
      const current = currentAncestors[index];
      if (!current) return;
      if (saved.id && current.id === saved.id) score += 12;
      if (saved.tag && current.tag === saved.tag) score += 3;
      if (saved.role && current.role === saved.role) score += 4;
      score += overlapScore(saved.classes, current.classes, 6);
    });
    return Math.min(22, score);
  }

  function hasRequiredAncestor(comment, element) {
    const meta = comment.targetMeta || {};
    const required = [];
    if (meta.stableAncestor?.id || meta.stableAncestor?.role) required.push(meta.stableAncestor);
    if (Array.isArray(meta.ancestors)) {
      meta.ancestors.forEach((ancestor) => {
        if (ancestor?.id || ancestor?.role) required.push(ancestor);
      });
    }
    if (!required.length) return true;
    const currentAncestors = currentAncestorMetas(element);
    return required.some((saved) => currentAncestors.some((current) => {
      if (saved.id && current.id === saved.id) return true;
      return Boolean(saved.role && current.role === saved.role && (!saved.tag || saved.tag === current.tag));
    }));
  }

  function violatesStrongMeta(comment, element) {
    const meta = comment.targetMeta || {};
    if (!meta || !Object.keys(meta).length) return false;
    const current = compactMeta(element);
    if (meta.id && current.id !== meta.id) return true;
    if (meta.ariaLabel && current.ariaLabel !== meta.ariaLabel) return true;
    if (meta.name && current.name !== meta.name) return true;
    if (meta.href && current.href !== meta.href) return true;
    if (!hasRequiredAncestor(comment, element)) return true;
    return false;
  }

  function metaScore(comment, element) {
    const meta = comment.targetMeta || {};
    if (!meta || !Object.keys(meta).length) return 0;
    const current = compactMeta(element);
    let score = 0;
    if (meta.tag) score += current.tag === meta.tag ? 12 : -32;
    if (meta.id) score += current.id === meta.id ? 42 : -80;
    if (meta.role) score += current.role === meta.role ? 12 : -4;
    if (meta.ariaLabel) score += current.ariaLabel === meta.ariaLabel ? 16 : -5;
    if (meta.name) score += current.name === meta.name ? 12 : -4;
    if (meta.type) score += current.type === meta.type ? 8 : -3;
    if (meta.href) score += current.href === meta.href ? 10 : 0;
    score += overlapScore(meta.classes, current.classes, 18);
    score += ancestorScore(meta.ancestors, element);
    return score;
  }

  function hasStrongMeta(comment) {
    const meta = comment.targetMeta || {};
    return Boolean(
      meta.id ||
      meta.ariaLabel ||
      meta.name ||
      meta.href ||
      (Array.isArray(meta.classes) && meta.classes.length) ||
      (Array.isArray(meta.ancestors) && meta.ancestors.some((ancestor) => ancestor?.id || ancestor?.role))
    );
  }

  function hasStrongReason(candidate) {
    return candidate.reasons.has("selector") || candidate.reasons.has("xpath") || candidate.reasons.has("meta");
  }

  function hasDistinctSnippet(comment) {
    return Array.from(String(comment.textSnippet || "").replace(/\s+/g, " ").trim()).length >= 4;
  }

  function safeInteractionLabel(step) {
    const meta = step.targetMeta || {};
    const bits = [];
    if (meta.tag) bits.push(meta.tag);
    if (meta.id) bits.push("#" + meta.id);
    if (Array.isArray(meta.classes) && meta.classes.length) bits.push("." + meta.classes.slice(0, 2).join("."));
    const text = String(step.textSnippet || meta.ariaLabel || "").trim();
    return [bits.join(""), text ? "“" + text.slice(0, 40) + "”" : ""].filter(Boolean).join(" ");
  }

  function locateHint(comment) {
    const meta = comment.targetMeta || {};
    const lines = [];
    if (Array.isArray(meta.hierarchy) && meta.hierarchy.length) {
      meta.hierarchy.forEach((item, index) => {
        const name = [
          item.tag,
          item.id ? "#" + item.id : "",
          Array.isArray(item.classes) && item.classes.length ? "." + item.classes.slice(0, 2).join(".") : "",
          item.role ? "[role=" + item.role + "]" : "",
          item.ariaLabel ? "[aria=" + item.ariaLabel + "]" : "",
          item.index ? ":nth-of-type(" + item.index + ")" : ""
        ].filter(Boolean).join("");
        lines.push((index + 1) + ". " + name + (item.text ? " - " + item.text : ""));
      });
    } else if (meta.path || comment.selector || comment.xpath) {
      lines.push(meta.path || comment.selector || comment.xpath);
    }
    return {
      title: "目标元素当前未显示",
      lines,
      stableAncestor: meta.stableAncestor || null,
      interactionPath: Array.isArray(meta.interactionPath) ? meta.interactionPath.map(safeInteractionLabel) : []
    };
  }

  function isSafeReplayTrigger(element) {
    if (!(element instanceof Element) || !isVisibleElement(element)) return false;
    if (element.matches(":disabled,[disabled],[aria-disabled='true']")) return false;
    const tag = element.tagName;
    const role = attr(element, "role");
    const type = attr(element, "type").toLowerCase();
    const label = normalizedText(element).toLowerCase();
    if (/(delete|remove|submit|save|buy|pay|purchase|删除|移除|提交|保存|购买|支付)/i.test(label)) return false;
    if (element instanceof HTMLAnchorElement && element.href) return false;
    if (tag === "SUMMARY") return true;
    if (role === "tab" || role === "button") return true;
    if (attr(element, "aria-controls")) return true;
    if (tag === "BUTTON") return !["submit", "reset"].includes(type) && Boolean(type || !element.closest("form"));
    return false;
  }

  function interactionStepFor(element) {
    const trigger = element instanceof Element ? element.closest("button,summary,[role='button'],[role='tab'],[aria-controls]") : null;
    if (!trigger || !isSafeReplayTrigger(trigger)) return null;
    return {
      selector: cssPath(trigger),
      xpath: xpathFor(trigger),
      textSnippet: normalizedText(trigger).slice(0, 160),
      targetMeta: compactMeta(trigger)
    };
  }

  function rememberSafeInteraction(element) {
    const step = interactionStepFor(element);
    if (!step) return;
    const fingerprint = JSON.stringify({ selector: step.selector, text: step.textSnippet, meta: step.targetMeta });
    const last = lastSafeInteractions[lastSafeInteractions.length - 1];
    if (last?.fingerprint === fingerprint) return;
    lastSafeInteractions = [...lastSafeInteractions, { ...step, fingerprint }].slice(-5);
  }

  function replayTargetForStep(step) {
    return findTarget({
      selector: step.selector,
      xpath: step.xpath,
      textSnippet: step.textSnippet,
      targetMeta: step.targetMeta || {},
      rect: {},
      viewport: {}
    });
  }

  function replayInteractionPath(comment, done) {
    const path = Array.isArray(comment.targetMeta?.interactionPath) ? comment.targetMeta.interactionPath : [];
    if (!path.length) {
      done(null);
      return;
    }
    let index = 0;
    function next() {
      const target = findTarget(comment);
      if (target) {
        done(target);
        return;
      }
      if (index >= path.length) {
        done(null);
        return;
      }
      const trigger = replayTargetForStep(path[index]);
      index += 1;
      if (trigger && isSafeReplayTrigger(trigger)) {
        replayingInteractions = true;
        trigger.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
        replayingInteractions = false;
      }
      window.setTimeout(next, 180);
    }
    next();
  }

  function candidateScore(comment, candidate) {
    const element = candidate.element;
    if (!isVisibleElement(element)) return -Infinity;
    if (violatesStrongMeta(comment, element)) return -Infinity;
    let score = 0;
    if (candidate.reasons.has("selector")) score += 55;
    if (candidate.reasons.has("xpath")) score += 50;
    if (candidate.reasons.has("meta")) score += 42;
    if (candidate.reasons.has("text")) score += 36;
    if (lastSelectorTag(comment.selector) === element.tagName) score += 8;
    if (textMatches(comment, element)) score += 28;
    else if (comment.textSnippet) score -= 65;
    const fingerprintScore = metaScore(comment, element);
    if (!hasStrongReason(candidate) && hasStrongMeta(comment) && fingerprintScore < 20) return -Infinity;
    score += fingerprintScore;
    score += rectScore(comment, element);
    const childCount = element.children?.length || 0;
    if (childCount > 8) score -= 12;
    return score;
  }

  function findTarget(comment) {
    const candidates = [];
    if (comment.selector) {
      try {
        document.querySelectorAll(comment.selector).forEach((element) => addCandidate(candidates, element, "selector"));
      } catch {}
    }
    addCandidate(candidates, findByXPath(comment.xpath), "xpath");
    addMetaCandidates(candidates, comment);

    const snippet = String(comment.textSnippet || "").replace(/\s+/g, " ").trim();
    if (snippet && hasDistinctSnippet(comment)) {
      const tag = lastSelectorTag(comment.selector);
      const query = tag ? tag.toLowerCase() : "button,a,input,textarea,select,[role],h1,h2,h3,p,span,div,li,td,th,label";
      try {
        document.querySelectorAll(query).forEach((element) => {
          if (textMatches(comment, element)) addCandidate(candidates, element, "text");
        });
      } catch {}
    }

    let best = null;
    let bestCandidate = null;
    let bestScore = -Infinity;
    candidates.forEach((candidate) => {
      const score = candidateScore(comment, candidate);
      if (score > bestScore) {
        best = candidate.element;
        bestCandidate = candidate;
        bestScore = score;
      }
    });

    const threshold = bestCandidate && hasStrongReason(bestCandidate) ? 40 : 76;
    return bestScore >= threshold ? best : null;
  }

  function isInspectable(element) {
    if (!(element instanceof Element)) return false;
    if (element.closest("[data-html-share-layer]")) return false;
    if (["HTML", "BODY", "SCRIPT", "STYLE", "META", "LINK", "TITLE"].includes(element.tagName)) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function clickOffsetFor(rect, event) {
    const x = Math.min(Math.max(0, event.clientX - rect.left), Math.max(0, rect.width));
    const y = Math.min(Math.max(0, event.clientY - rect.top), Math.max(0, rect.height));
    return {
      x,
      y,
      ratioX: rect.width ? x / rect.width : 0,
      ratioY: rect.height ? y / rect.height : 0
    };
  }

  function payloadFor(element, event) {
    const rect = element.getBoundingClientRect();
    const clickOffset = clickOffsetFor(rect, event);
    return {
      selector: cssPath(element),
      xpath: xpathFor(element),
      textSnippet: (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 240),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      clickAnchor: { x: event.clientX - 1, y: event.clientY - 1, width: 2, height: 2 },
      viewport: { width: window.innerWidth, height: window.innerHeight, scrollX: window.scrollX, scrollY: window.scrollY },
      targetMeta: { ...compactMeta(element), clickOffset, interactionPath: lastSafeInteractions.map(({ fingerprint, ...step }) => step) },
    };
  }

  function positionBox(box, element) {
    if (!element || !isInspectable(element)) {
      box.style.display = "none";
      return null;
    }
    const rect = element.getBoundingClientRect();
    box.style.display = "block";
    box.style.left = Math.max(0, rect.left + window.scrollX) + "px";
    box.style.top = Math.max(0, rect.top + window.scrollY) + "px";
    box.style.width = Math.max(1, rect.width) + "px";
    box.style.height = Math.max(1, rect.height) + "px";
    return rect;
  }

  function renderHover() {
    ensureLayer();
    if (!commentMode || lockedElement) {
      hoverBox.style.display = "none";
      return;
    }
    positionBox(hoverBox, hoveredElement);
  }

  function renderLocked() {
    ensureLayer();
    positionBox(lockedBox, lockedElement);
  }

  function firstChar(value) {
    return Array.from(String(value || "?").trim())[0] || "?";
  }

  function markerAnchor(marker) {
    const rect = marker.getBoundingClientRect();
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
  }

  function markerPoint(comment, rect) {
    const offset = comment.targetMeta?.clickOffset || {};
    const ratioX = Number(offset.ratioX);
    const ratioY = Number(offset.ratioY);
    if (Number.isFinite(ratioX) && Number.isFinite(ratioY)) {
      return {
        x: rect.left + window.scrollX + Math.min(Math.max(0, ratioX), 1) * rect.width,
        y: rect.top + window.scrollY + Math.min(Math.max(0, ratioY), 1) * rect.height
      };
    }
    const x = Number(offset.x);
    const y = Number(offset.y);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      return {
        x: rect.left + window.scrollX + Math.min(Math.max(0, x), rect.width),
        y: rect.top + window.scrollY + Math.min(Math.max(0, y), rect.height)
      };
    }
    return { x: rect.left + window.scrollX, y: rect.top + window.scrollY };
  }

  function renderComments(comments) {
    ensureLayer();
    commentsCache = comments || [];
    markers.forEach((marker) => marker.remove());
    markers.clear();
    commentsCache.forEach((comment) => {
      const target = findTarget(comment);
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = "html-share-marker " + (comment.status === "resolved" ? "resolved" : "");
      marker.title = comment.body || "Comment";
      marker.innerHTML = "<span class='html-share-marker-shell'><span class='html-share-marker-avatar'></span></span>";
      marker.querySelector(".html-share-marker-avatar").textContent = firstChar(comment.authorName);
      const point = markerPoint(comment, rect);
      marker.style.left = Math.max(0, point.x - 18) + "px";
      marker.style.top = Math.max(0, point.y - 18) + "px";
      marker.addEventListener("pointerenter", () => {
        window.parent.postMessage({ source: "html-share-bridge", type: "marker-hover", id: comment.id, anchor: markerAnchor(marker) }, "*");
      });
      marker.addEventListener("pointerleave", () => {
        window.parent.postMessage({ source: "html-share-bridge", type: "marker-leave", id: comment.id }, "*");
      });
      let markerOpenedAt = 0;
      function openMarker(event) {
        event.preventDefault();
        event.stopPropagation();
        if (Date.now() - markerOpenedAt < 250) return;
        markerOpenedAt = Date.now();
        lockedElement = target;
        renderHover();
        renderLocked();
        window.parent.postMessage({ source: "html-share-bridge", type: "marker-click", id: comment.id, anchor: markerAnchor(marker), reason: "user-open" }, "*");
      }
      marker.addEventListener("pointerdown", openMarker);
      marker.addEventListener("click", openMarker);
      layer.appendChild(marker);
      markers.set(comment.id, marker);
    });
    resolvePendingLocate();
  }

  function rerenderOverlay() {
    renderHover();
    renderLocked();
    renderComments(commentsCache);
  }

  function scheduleRerender() {
    window.clearTimeout(rerenderTimer);
    rerenderTimer = window.setTimeout(rerenderOverlay, 80);
  }

  function resolvePendingLocate() {
    if (!pendingLocateComment) return;
    const target = findTarget(pendingLocateComment);
    if (!target) return;
    const comment = pendingLocateComment;
    const options = pendingLocateOptions || {};
    pendingLocateComment = null;
    pendingLocateOptions = {};
    target.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    lockedElement = target;
    window.setTimeout(() => {
      renderHover();
      renderLocked();
      renderComments(commentsCache);
      const marker = markers.get(comment.id);
      if (marker) {
        window.parent.postMessage({
          source: "html-share-bridge",
          type: "comment-located",
          id: comment.id,
          anchor: markerAnchor(marker),
          reason: options.reason || "background-locate",
          openDetail: Boolean(options.openDetail)
        }, "*");
      }
    }, 260);
  }

  function setMode(enabled) {
    commentMode = Boolean(enabled);
    document.documentElement.classList.toggle("html-share-comment-mode", commentMode);
    if (!commentMode) {
      hoveredElement = null;
      lockedElement = null;
    }
    rerenderOverlay();
  }

  document.addEventListener("pointerover", (event) => {
    if (!commentMode || lockedElement) return;
    const target = event.target;
    hoveredElement = isInspectable(target) ? target : null;
    renderHover();
  }, true);

  document.addEventListener("pointerout", (event) => {
    if (!commentMode || lockedElement) return;
    if (event.target === hoveredElement) {
      hoveredElement = null;
      renderHover();
    }
  }, true);

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest("[data-html-share-layer]")) return;
    if (replayingInteractions) return;
    if (!commentMode) rememberSafeInteraction(target);
    window.parent.postMessage({ source: "html-share-bridge", type: "canvas-click" }, "*");
    if (!commentMode) return;
    if (!isInspectable(target)) return;
    event.preventDefault();
    event.stopPropagation();
    lockedElement = target;
    renderHover();
    renderLocked();
    window.parent.postMessage({ source: "html-share-bridge", type: "element-click", payload: payloadFor(target, event) }, "*");
  }, true);

  window.addEventListener("message", (event) => {
    const message = event.data || {};
    if (message.source !== "html-share-parent") return;
    if (message.type === "set-mode") setMode(message.enabled);
    if (message.type === "clear-selection") {
      lockedElement = null;
      hoveredElement = null;
      pendingLocateComment = null;
      pendingLocateOptions = {};
      rerenderOverlay();
    }
    if (message.type === "render-comments") renderComments(message.comments || []);
    if (message.type === "locate") {
      const target = findTarget(message.comment || {});
      const options = { reason: message.reason || "background-locate", openDetail: Boolean(message.openDetail) };
      const completeLocate = (locatedTarget) => {
        if (!locatedTarget) {
          pendingLocateComment = message.comment || null;
          pendingLocateOptions = options;
          window.parent.postMessage({
            source: "html-share-bridge",
            type: "comment-missing",
            id: message.comment?.id,
            reason: options.reason,
            openDetail: options.openDetail,
            hint: locateHint(message.comment || {})
          }, "*");
          return;
        }
        locatedTarget.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
        lockedElement = locatedTarget;
        window.setTimeout(() => {
          rerenderOverlay();
          const marker = markers.get(message.comment?.id);
          if (marker) {
            window.parent.postMessage({
              source: "html-share-bridge",
              type: "comment-located",
              id: message.comment.id,
              anchor: markerAnchor(marker),
              reason: options.reason,
              openDetail: options.openDetail
            }, "*");
          }
        }, 260);
      };
      if (target) completeLocate(target);
      else if (message.replay !== false) replayInteractionPath(message.comment || {}, completeLocate);
      else completeLocate(null);
    }
  });

  window.addEventListener("resize", rerenderOverlay);
  window.addEventListener("scroll", scheduleRerender, true);
  const observer = new MutationObserver(scheduleRerender);
  window.addEventListener("load", () => {
    ensureLayer();
    if (document.body) observer.observe(document.body, { attributes: true, childList: true, subtree: true, attributeFilter: ["class", "style", "hidden", "aria-hidden"] });
    window.parent.postMessage({ source: "html-share-bridge", type: "ready" }, "*");
  });
  ensureLayer();
  if (document.body) observer.observe(document.body, { attributes: true, childList: true, subtree: true, attributeFilter: ["class", "style", "hidden", "aria-hidden"] });
})();
`;
}

export function injectBridge(html: string) {
  const script = `<script>${injectedBridgeScript()}<\/script>`;
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${script}</body>`);
  }
  return `${html}${script}`;
}
