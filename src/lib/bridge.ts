export function injectedBridgeScript() {
  return String.raw`
(() => {
  if (window.__htmlShareBridgeReady) return;
  window.__htmlShareBridgeReady = true;

  let commentMode = false;
  let activeOutline = null;
  const markers = new Map();

  const markerLayer = document.createElement("div");
  markerLayer.setAttribute("data-html-share-layer", "true");
  Object.assign(markerLayer.style, {
    position: "absolute",
    inset: "0",
    pointerEvents: "none",
    zIndex: "2147483647",
  });

  const style = document.createElement("style");
  style.textContent = [
    "[data-html-share-active] { outline: 3px solid #ffb000 !important; outline-offset: 2px !important; }",
    ".html-share-marker { position: absolute; width: 22px; height: 22px; border-radius: 999px; display: grid; place-items: center; font: 700 12px ui-sans-serif, system-ui; color: #111; background: #ffb000; border: 2px solid #111; box-shadow: 0 8px 20px rgba(0,0,0,.22); pointer-events: auto; cursor: pointer; }",
    ".html-share-marker.resolved { background: #d6d3d1; color: #57534e; border-color: #78716c; }"
  ].join("\n");

  function ensureLayer() {
    if (!document.head.contains(style)) document.head.appendChild(style);
    if (document.body && !document.body.contains(markerLayer)) document.body.appendChild(markerLayer);
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

  function setActive(element) {
    if (activeOutline) activeOutline.removeAttribute("data-html-share-active");
    activeOutline = element;
    if (activeOutline) activeOutline.setAttribute("data-html-share-active", "true");
  }

  function renderComments(comments) {
    ensureLayer();
    markers.forEach((marker) => marker.remove());
    markers.clear();
    comments.forEach((comment, index) => {
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
      markerLayer.appendChild(marker);
      markers.set(comment.id, marker);
    });
  }

  document.addEventListener("click", (event) => {
    if (!commentMode) return;
    const target = event.target;
    if (!(target instanceof Element) || target.closest("[data-html-share-layer]")) return;
    event.preventDefault();
    event.stopPropagation();
    setActive(target);
    window.parent.postMessage({ source: "html-share-bridge", type: "element-click", payload: payloadFor(target) }, "*");
  }, true);

  window.addEventListener("message", (event) => {
    const message = event.data || {};
    if (message.source !== "html-share-parent") return;
    if (message.type === "set-mode") commentMode = Boolean(message.enabled);
    if (message.type === "render-comments") renderComments(message.comments || []);
    if (message.type === "locate") {
      const target = findTarget(message.comment || {});
      if (target) {
        target.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
        setActive(target);
      }
    }
  });

  window.addEventListener("resize", () => window.parent.postMessage({ source: "html-share-bridge", type: "request-comments" }, "*"));
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
