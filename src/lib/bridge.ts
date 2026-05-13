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
  const hoverLabel = document.createElement("div");
  hoverLabel.className = "html-share-label";

  const style = document.createElement("style");
  style.textContent = [
    ".html-share-selection { position: absolute; display: none; box-sizing: border-box; border: 2px solid #1a73ff; background: rgba(26, 115, 255, .12); box-shadow: 0 0 0 1px rgba(255,255,255,.95), 0 8px 24px rgba(26,115,255,.18); border-radius: 3px; pointer-events: none; }",
    ".html-share-selection-hover { border-style: solid; }",
    ".html-share-selection-locked { display: block; background: rgba(26, 115, 255, .18); box-shadow: 0 0 0 1px rgba(255,255,255,.95), 0 0 0 4px rgba(26,115,255,.22), 0 14px 34px rgba(26,115,255,.24); }",
    ".html-share-label { position: absolute; display: none; height: 22px; padding: 0 8px; border-radius: 6px; align-items: center; background: #1a73ff; color: white; font: 700 12px ui-sans-serif, system-ui; box-shadow: 0 8px 22px rgba(26,115,255,.32); pointer-events: none; white-space: nowrap; }",
    ".html-share-marker { position: absolute; width: 22px; height: 22px; border-radius: 999px; display: grid; place-items: center; font: 800 12px ui-sans-serif, system-ui; color: white; background: #1a73ff; border: 2px solid white; box-shadow: 0 8px 20px rgba(0,0,0,.24); pointer-events: auto; cursor: pointer; }",
    ".html-share-marker.resolved { background: #94a3b8; color: #0f172a; border-color: white; }"
  ].join("\n");

  function ensureLayer() {
    if (!document.head.contains(style)) document.head.appendChild(style);
    if (document.body && !document.body.contains(layer)) {
      document.body.appendChild(layer);
      layer.appendChild(hoverBox);
      layer.appendChild(lockedBox);
      layer.appendChild(hoverLabel);
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

  function elementLabel(element) {
    const name = element.nodeName.toLowerCase();
    const id = element.id ? "#" + element.id : "";
    const className = typeof element.className === "string" && element.className.trim()
      ? "." + element.className.trim().split(/\s+/).slice(0, 2).join(".")
      : "";
    return (name + id + className).slice(0, 64);
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
      hoverLabel.style.display = "none";
      return;
    }
    const rect = positionBox(hoverBox, hoveredElement);
    if (!rect || !hoveredElement) {
      hoverLabel.style.display = "none";
      return;
    }
    hoverLabel.style.display = "inline-flex";
    hoverLabel.textContent = elementLabel(hoveredElement);
    hoverLabel.style.left = Math.max(0, rect.left + window.scrollX) + "px";
    hoverLabel.style.top = Math.max(0, rect.top + window.scrollY - 26) + "px";
  }

  function renderLocked() {
    ensureLayer();
    positionBox(lockedBox, lockedElement);
  }

  function setLocked(element) {
    lockedElement = element;
    renderHover();
    renderLocked();
  }

  function renderComments(comments) {
    ensureLayer();
    commentsCache = comments || [];
    markers.forEach((marker) => marker.remove());
    markers.clear();
    commentsCache.forEach((comment, index) => {
      const target = findTarget(comment);
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = "html-share-marker " + (comment.status === "resolved" ? "resolved" : "");
      marker.textContent = String(index + 1);
      marker.title = comment.body || "Comment";
      marker.style.left = Math.max(0, rect.left + window.scrollX - 11) + "px";
      marker.style.top = Math.max(0, rect.top + window.scrollY - 11) + "px";
      marker.addEventListener("click", () => {
        window.parent.postMessage({ source: "html-share-bridge", type: "pin-click", id: comment.id }, "*");
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
    if (!commentMode) return;
    const target = event.target;
    if (!isInspectable(target)) return;
    event.preventDefault();
    event.stopPropagation();
    setLocked(target);
    window.parent.postMessage({ source: "html-share-bridge", type: "element-click", payload: payloadFor(target) }, "*");
  }, true);

  window.addEventListener("message", (event) => {
    const message = event.data || {};
    if (message.source !== "html-share-parent") return;
    if (message.type === "set-mode") {
      commentMode = Boolean(message.enabled);
      if (!commentMode) {
        hoveredElement = null;
        lockedElement = null;
      }
      rerenderOverlay();
    }
    if (message.type === "clear-selection") {
      lockedElement = null;
      rerenderOverlay();
    }
    if (message.type === "render-comments") renderComments(message.comments || []);
    if (message.type === "locate") {
      const target = findTarget(message.comment || {});
      if (target) {
        target.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
        setLocked(target);
        window.setTimeout(rerenderOverlay, 260);
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
