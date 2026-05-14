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
  let rerenderTimer = null;
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

  const cursorSvg = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Cpath d='M8 5h11a8 8 0 0 1 8 8v1a8 8 0 0 1-8 8h-6l-7 5v-7a8 8 0 0 1 2-15Z' fill='%231a9cff' stroke='white' stroke-width='2'/%3E%3C/svg%3E\") 8 8, crosshair";
  const style = document.createElement("style");
  style.textContent = [
    ".html-share-comment-mode, .html-share-comment-mode * { cursor: " + cursorSvg + " !important; }",
    ".html-share-selection { position: absolute; display: none; box-sizing: border-box; border: 2px solid #1a9cff; background: rgba(26,156,255,.12); box-shadow: 0 0 0 1px rgba(255,255,255,.95), 0 8px 24px rgba(26,156,255,.18); border-radius: 4px; pointer-events: none; transition: left 80ms ease, top 80ms ease, width 80ms ease, height 80ms ease; }",
    ".html-share-selection-locked { background: rgba(26,156,255,.18); box-shadow: 0 0 0 1px rgba(255,255,255,.95), 0 0 0 4px rgba(26,156,255,.22), 0 14px 34px rgba(26,156,255,.24); }",
    ".html-share-marker { position: absolute; width: 38px; height: 38px; border: 0; background: transparent; pointer-events: auto; cursor: pointer !important; padding: 0; filter: drop-shadow(0 10px 18px rgba(15, 23, 42, .22)); }",
    ".html-share-marker-shell { position: absolute; inset: 0; border-radius: 999px 999px 999px 7px; background: white; border: 2px solid #1a9cff; display: grid; place-items: center; transform: rotate(-45deg); }",
    ".html-share-marker-avatar { width: 24px; height: 24px; border-radius: 999px; display: grid; place-items: center; color: white; background: #1a9cff; font: 800 12px ui-sans-serif, system-ui; transform: rotate(45deg); }",
    ".html-share-marker.resolved { opacity: .58; filter: grayscale(1) drop-shadow(0 8px 14px rgba(15, 23, 42, .18)); }"
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
    return {
      tag: element.tagName.toLowerCase(),
      id: element.id || "",
      classes: classTokens(element),
      role: attr(element, "role"),
      ariaLabel: attr(element, "aria-label"),
      name: attr(element, "name"),
      type: attr(element, "type"),
      href: element instanceof HTMLAnchorElement ? element.href : "",
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

  function ancestorScore(savedAncestors, element) {
    if (!Array.isArray(savedAncestors) || !savedAncestors.length) return 0;
    let score = 0;
    const currentAncestors = [];
    let parent = element.parentElement;
    while (parent && parent !== document.documentElement && currentAncestors.length < 6) {
      currentAncestors.push(compactMeta(parent));
      parent = parent.parentElement;
    }
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

  function candidateScore(comment, candidate) {
    const element = candidate.element;
    if (!isVisibleElement(element)) return -Infinity;
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

  function payloadFor(element) {
    const rect = element.getBoundingClientRect();
    return {
      selector: cssPath(element),
      xpath: xpathFor(element),
      textSnippet: (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 240),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      viewport: { width: window.innerWidth, height: window.innerHeight, scrollX: window.scrollX, scrollY: window.scrollY },
      targetMeta: compactMeta(element),
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
      marker.style.left = Math.max(0, rect.left + window.scrollX - 19) + "px";
      marker.style.top = Math.max(0, rect.top + window.scrollY - 19) + "px";
      marker.addEventListener("pointerenter", () => {
        window.parent.postMessage({ source: "html-share-bridge", type: "marker-hover", id: comment.id, anchor: markerAnchor(marker) }, "*");
      });
      marker.addEventListener("pointerleave", () => {
        window.parent.postMessage({ source: "html-share-bridge", type: "marker-leave", id: comment.id }, "*");
      });
      marker.addEventListener("click", () => {
        window.parent.postMessage({ source: "html-share-bridge", type: "marker-click", id: comment.id, anchor: markerAnchor(marker) }, "*");
      });
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
    pendingLocateComment = null;
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
          anchor: markerAnchor(marker)
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
    window.parent.postMessage({ source: "html-share-bridge", type: "canvas-click" }, "*");
    if (!commentMode) return;
    if (!isInspectable(target)) return;
    event.preventDefault();
    event.stopPropagation();
    lockedElement = target;
    renderHover();
    renderLocked();
    window.parent.postMessage({ source: "html-share-bridge", type: "element-click", payload: payloadFor(target) }, "*");
  }, true);

  window.addEventListener("message", (event) => {
    const message = event.data || {};
    if (message.source !== "html-share-parent") return;
    if (message.type === "set-mode") setMode(message.enabled);
    if (message.type === "clear-selection") {
      lockedElement = null;
      hoveredElement = null;
      pendingLocateComment = null;
      rerenderOverlay();
    }
    if (message.type === "render-comments") renderComments(message.comments || []);
    if (message.type === "locate") {
      const target = findTarget(message.comment || {});
      if (target) {
        target.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
        lockedElement = target;
        window.setTimeout(() => {
          rerenderOverlay();
          const marker = markers.get(message.comment?.id);
          if (marker) {
            window.parent.postMessage({
              source: "html-share-bridge",
              type: "comment-located",
              id: message.comment.id,
              anchor: markerAnchor(marker)
            }, "*");
          }
        }, 260);
      } else {
        pendingLocateComment = message.comment || null;
        window.parent.postMessage({
          source: "html-share-bridge",
          type: "comment-missing",
          id: message.comment?.id
        }, "*");
      }
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
