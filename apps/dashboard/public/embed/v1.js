/**
 * Kraterion chat embed — v1 loader.
 *
 * Usage on the customer's site (single line, no build step):
 *
 *   <script src="https://<your-kraterion-host>/embed/v1.js"
 *           data-agent-id="<uuid>"
 *           data-token="kr_share_test_..."
 *           async></script>
 *
 * Optional attributes:
 *   data-position    "br" (default) | "bl" — bottom-right or -left
 *   data-label       launcher button label (default "Chat")
 *   data-host        override the dashboard origin for the iframe
 *                    (defaults to the origin this script was served from)
 *
 * The loader mounts a launcher button inside a closed Shadow DOM so
 * neither side's CSS leaks. On click, an iframe pointed at the
 * dashboard's `/embed/chat/<agent>?t=<token>` page is created and
 * positioned over the launcher. All chat traffic flows through that
 * iframe — the loader doesn't touch chat APIs directly.
 *
 * Security model: the loader is plain JS with no privileged
 * capabilities. The share token in the iframe URL is checked
 * server-side on every chat call (origin allowlist + daily caps).
 */
(function () {
  "use strict";

  // === Read config from the script tag itself ============================

  // `document.currentScript` is set during the synchronous script-tag
  // execution. We grab it once at module init; if the snippet is
  // loaded with `defer` we fall back to a `data-kraterion-embed`
  // attribute selector.
  var currentScript =
    document.currentScript ||
    document.querySelector("script[data-kraterion-embed]");
  if (!currentScript) {
    console.warn("[kraterion] embed loader couldn't find its <script> tag");
    return;
  }

  var agentId = currentScript.getAttribute("data-agent-id");
  var token = currentScript.getAttribute("data-token");
  var label = currentScript.getAttribute("data-label") || "Chat";
  var position = currentScript.getAttribute("data-position") === "bl" ? "bl" : "br";
  var host = currentScript.getAttribute("data-host") || originOf(currentScript.src);

  if (!agentId || !token) {
    console.warn(
      "[kraterion] embed loader requires data-agent-id and data-token attributes on the <script> tag",
    );
    return;
  }

  // === Mount the launcher ================================================

  // We attach a single host element to the document and a closed
  // Shadow DOM inside it. Closed mode means the host page's JS
  // cannot probe `.shadowRoot` — keeps the widget UI a black box.
  var hostEl = document.createElement("div");
  hostEl.setAttribute("data-kraterion-widget", "");
  hostEl.style.cssText =
    "position:fixed;z-index:2147483647;" +
    (position === "br" ? "right:20px;bottom:20px;" : "left:20px;bottom:20px;") +
    "pointer-events:none;";
  document.body.appendChild(hostEl);
  var shadow = hostEl.attachShadow({ mode: "closed" });

  // Scoped styles live inside the shadow tree. Each rule is hand-
  // written and matches the canonical light-variant brand palette
  // (see `design-system/assets/kraterion-light.svg`).
  var styles = document.createElement("style");
  styles.textContent =
    ":host{all:initial}" +
    ".kr-btn{pointer-events:auto;display:inline-flex;align-items:center;gap:8px;" +
    "padding:10px 14px;border:1px solid #A89C82;border-radius:9999px;" +
    "background:#F8F4EC;color:#1A1610;font:500 14px/1 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;" +
    "cursor:pointer;transition:background .15s ease}" +
    ".kr-btn:hover{background:#F1ECE0}" +
    ".kr-btn:focus-visible{outline:2px solid #C45B36;outline-offset:1px}" +
    ".kr-btn svg{flex-shrink:0}" +
    ".kr-iframe-wrap{pointer-events:auto;display:none;position:fixed;" +
    (position === "br" ? "right:20px;bottom:20px;" : "left:20px;bottom:20px;") +
    "width:380px;height:580px;max-width:calc(100vw - 24px);max-height:calc(100vh - 40px);" +
    "border:1px solid #A89C82;border-radius:12px;background:#F8F4EC;overflow:hidden}" +
    ".kr-iframe-wrap.open{display:block}" +
    ".kr-iframe-wrap iframe{width:100%;height:100%;border:0;display:block}" +
    ".kr-close{position:absolute;top:8px;right:8px;width:28px;height:28px;" +
    "display:inline-flex;align-items:center;justify-content:center;" +
    "border:1px solid #A89C82;border-radius:8px;background:#F8F4EC;cursor:pointer;" +
    "color:#1A1610;font:500 16px/1 system-ui}" +
    ".kr-close:hover{background:#F1ECE0}" +
    "@media (max-width:480px){" +
    ".kr-iframe-wrap{right:0!important;left:0!important;bottom:0!important;" +
    "width:100%;height:100%;max-width:100%;max-height:100%;border-radius:0;border:0}" +
    "}";
  shadow.appendChild(styles);

  // The launcher button (always visible).
  var launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "kr-btn";
  launcher.setAttribute("aria-label", label);
  // Inline SVG — same earth-tone three-ring logo as the dashboard
  // navbar + landing header. No krater-orange dot per the
  // 2026-05-14 design-system update.
  launcher.innerHTML =
    '<svg viewBox="0 0 256 256" width="18" height="18" aria-hidden="true">' +
    '<circle cx="128" cy="128" r="110" fill="none" stroke="#7C7158" stroke-width="14"/>' +
    '<circle cx="128" cy="128" r="68" fill="none" stroke="#403930" stroke-width="14"/>' +
    '<circle cx="128" cy="128" r="22" fill="#1A1610"/>' +
    "</svg><span>" +
    escapeHtml(label) +
    "</span>";
  shadow.appendChild(launcher);

  // Iframe wrapper — built once, lazy-injected on first open so we
  // don't pay the network cost until a visitor clicks. Subsequent
  // opens reuse the same iframe (preserves chat state across
  // close/open within the same page session).
  var iframeWrap = null;
  var iframe = null;

  function open() {
    if (!iframeWrap) {
      iframeWrap = document.createElement("div");
      iframeWrap.className = "kr-iframe-wrap";

      var closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "kr-close";
      closeBtn.setAttribute("aria-label", "Close chat");
      closeBtn.innerHTML = "&times;";
      closeBtn.addEventListener("click", close);
      iframeWrap.appendChild(closeBtn);

      iframe = document.createElement("iframe");
      iframe.title = "Kraterion chat";
      iframe.src =
        host.replace(/\/+$/, "") +
        "/embed/chat/" +
        encodeURIComponent(agentId) +
        "?t=" +
        encodeURIComponent(token);
      iframe.setAttribute("loading", "eager");
      // Allow scripts (the iframe is a Next.js page) + same-origin
      // (it's our own dashboard; React app needs storage access).
      iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
      iframe.setAttribute(
        "allow",
        "clipboard-write; autoplay 'none'; encrypted-media 'none'",
      );
      iframeWrap.appendChild(iframe);
      shadow.appendChild(iframeWrap);
    }
    iframeWrap.classList.add("open");
  }

  function close() {
    if (iframeWrap) iframeWrap.classList.remove("open");
  }

  launcher.addEventListener("click", function (e) {
    e.preventDefault();
    if (iframeWrap && iframeWrap.classList.contains("open")) close();
    else open();
  });

  // Listen for postMessage from the iframe (future-friendly hook
  // for "close from inside" or "resize" requests). v1 only
  // supports `kraterion:close`.
  window.addEventListener("message", function (event) {
    if (!iframe || event.source !== iframe.contentWindow) return;
    var data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.kind === "kraterion:close") close();
  });

  // === Utilities =========================================================

  function originOf(url) {
    try {
      var u = new URL(url, document.baseURI);
      return u.origin;
    } catch (_e) {
      return "";
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return (
        { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ||
        c
      );
    });
  }
})();
