export function injectedBridgeScript() {
  return String.raw`
(() => {
  if (window.__htmlShareBridgeReady) return;
  window.__htmlShareBridgeReady = true;

  let commentMode = false;
  let hoveredElement = null;
  let lockedElement = null;
  let commentsCache = [];
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

  function findTarget(comment) {
    if (comment.selector) {
      try {
        const selected = document.querySelector(comment.selector);
        if (selected) return selected;
      } catch {}
    }
    return findByXPath(comment.xpath);
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
  }

  function rerenderOverlay() {
    renderHover();
    renderLocked();
    renderComments(commentsCache);
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
      }
    }
  });

  window.addEventListener("resize", rerenderOverlay);
  window.addEventListener("scroll", rerenderOverlay, true);
  window.addEventListener("load", () => {
    ensureLayer();
    window.parent.postMessage({ source: "html-share-bridge", type: "ready" }, "*");
  });
  ensureLayer();
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
