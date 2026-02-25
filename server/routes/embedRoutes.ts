import { Router } from "express";

const router = Router();

/**
 * Serves the embeddable booking widget script.
 *
 * Business owners add this to their website:
 *
 * Inline mode (booking form appears on the page):
 *   <script src="https://www.smallbizagent.ai/api/embed/booking-widget.js"
 *           data-slug="tonys-barbershop"></script>
 *
 * Button mode (opens booking in a modal overlay):
 *   <script src="https://www.smallbizagent.ai/api/embed/booking-widget.js"
 *           data-slug="tonys-barbershop"
 *           data-mode="button"
 *           data-text="Book Now"></script>
 */
router.get("/embed/booking-widget.js", (req, res) => {
  // Determine the base URL from the request
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "www.smallbizagent.ai";
  const baseUrl = `${protocol}://${host}`;

  const script = `
(function() {
  'use strict';

  // Find the current script tag to read data attributes
  var scripts = document.getElementsByTagName('script');
  var currentScript = scripts[scripts.length - 1];
  var slug = currentScript.getAttribute('data-slug');
  var mode = currentScript.getAttribute('data-mode') || 'inline';
  var buttonText = currentScript.getAttribute('data-text') || 'Book Now';
  var buttonColor = currentScript.getAttribute('data-color') || '#6366f1';
  var baseUrl = '${baseUrl}';

  if (!slug) {
    console.error('[SmallBizAgent] Missing data-slug attribute on embed script');
    return;
  }

  var bookingUrl = baseUrl + '/book/' + slug + '?embed=true';

  // Inline mode: embed the booking form directly on the page
  if (mode === 'inline') {
    var container = document.createElement('div');
    container.id = 'sba-booking-container';
    container.style.cssText = 'width:100%;max-width:700px;margin:0 auto;';

    var iframe = document.createElement('iframe');
    iframe.src = bookingUrl;
    iframe.style.cssText = 'width:100%;border:none;min-height:600px;border-radius:12px;';
    iframe.setAttribute('title', 'Book an appointment');
    iframe.setAttribute('loading', 'lazy');

    container.appendChild(iframe);
    currentScript.parentNode.insertBefore(container, currentScript.nextSibling);

    // Listen for resize messages from the iframe
    window.addEventListener('message', function(e) {
      if (e.data && e.data.type === 'sba-booking-resize' && e.data.height) {
        iframe.style.height = (e.data.height + 20) + 'px';
      }
    });

    return;
  }

  // Button mode: show a "Book Now" button that opens a modal overlay
  if (mode === 'button') {
    var btn = document.createElement('button');
    btn.textContent = buttonText;
    btn.style.cssText = 'display:inline-flex;align-items:center;gap:8px;padding:12px 24px;' +
      'background:' + buttonColor + ';color:#fff;border:none;border-radius:8px;' +
      'font-size:16px;font-weight:600;cursor:pointer;font-family:inherit;' +
      'transition:opacity 0.2s;box-shadow:0 2px 8px rgba(0,0,0,0.15);';
    btn.onmouseover = function() { btn.style.opacity = '0.9'; };
    btn.onmouseout = function() { btn.style.opacity = '1'; };

    currentScript.parentNode.insertBefore(btn, currentScript.nextSibling);

    btn.addEventListener('click', function() {
      // Create modal overlay
      var overlay = document.createElement('div');
      overlay.id = 'sba-booking-overlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;' +
        'background:rgba(0,0,0,0.6);z-index:999999;display:flex;' +
        'align-items:center;justify-content:center;padding:16px;' +
        'animation:sbaFadeIn 0.2s ease;';

      // Modal container
      var modal = document.createElement('div');
      modal.style.cssText = 'width:100%;max-width:700px;max-height:90vh;' +
        'background:#fff;border-radius:16px;overflow:hidden;position:relative;' +
        'box-shadow:0 20px 60px rgba(0,0,0,0.3);';

      // Close button
      var closeBtn = document.createElement('button');
      closeBtn.innerHTML = '&times;';
      closeBtn.style.cssText = 'position:absolute;top:8px;right:12px;z-index:10;' +
        'background:rgba(0,0,0,0.1);border:none;width:32px;height:32px;' +
        'border-radius:50%;font-size:20px;cursor:pointer;display:flex;' +
        'align-items:center;justify-content:center;color:#333;';
      closeBtn.onclick = function() { document.body.removeChild(overlay); };

      // Iframe
      var modalIframe = document.createElement('iframe');
      modalIframe.src = bookingUrl;
      modalIframe.style.cssText = 'width:100%;height:80vh;border:none;';
      modalIframe.setAttribute('title', 'Book an appointment');

      modal.appendChild(closeBtn);
      modal.appendChild(modalIframe);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      // Close on overlay click (outside modal)
      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
          document.body.removeChild(overlay);
        }
      });

      // Close on Escape key
      var escHandler = function(e) {
        if (e.key === 'Escape') {
          var el = document.getElementById('sba-booking-overlay');
          if (el) document.body.removeChild(el);
          document.removeEventListener('keydown', escHandler);
        }
      };
      document.addEventListener('keydown', escHandler);

      // Listen for resize
      window.addEventListener('message', function(e) {
        if (e.data && e.data.type === 'sba-booking-resize' && e.data.height) {
          modalIframe.style.height = Math.min(e.data.height + 20, window.innerHeight * 0.85) + 'px';
        }
      });
    });

    return;
  }

  console.error('[SmallBizAgent] Invalid data-mode. Use "inline" or "button".');
})();
`.trim();

  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600"); // Cache for 1 hour
  res.setHeader("Access-Control-Allow-Origin", "*"); // Allow embedding from any domain
  res.send(script);
});

export default router;
