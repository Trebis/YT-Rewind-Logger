// Runs in the page's MAIN world — intercepts VTT subtitle fetches and SPA navigation.
// Must load at document_start to patch fetch/XHR before the page makes subtitle requests.
(function () {
  // --- VTT Interception ---

  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';

    // Intercept VTT subtitle responses
    if (url.includes('.vtt') || url.includes('subtitle') || url.includes('caption')) {
      try {
        const clone = response.clone();
        const text = await clone.text();
        if (text.includes('WEBVTT')) {
          window.postMessage({
            type: 'DS_REWIND_VTT_DATA',
            url: url,
            vttText: text
          }, '*');
        }
      } catch (e) {
        // Silently fail — don't break the page
      }
    }

    return response;
  };

  // Also intercept XMLHttpRequest
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._dsRewindUrl = typeof url === 'string' ? url : '';
    return originalXHROpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', function () {
      const url = this._dsRewindUrl || '';
      if (url.includes('.vtt') || url.includes('subtitle') || url.includes('caption')) {
        try {
          const text = this.responseText;
          if (text && text.includes('WEBVTT')) {
            window.postMessage({
              type: 'DS_REWIND_VTT_DATA',
              url: url,
              vttText: text
            }, '*');
          }
        } catch (e) { /* silent */ }
      }
    });
    return originalXHRSend.apply(this, args);
  };

  // --- SPA Navigation Interception ---

  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (...args) {
    const result = originalPushState.apply(this, args);
    window.postMessage({ type: 'DS_REWIND_NAVIGATION' }, '*');
    return result;
  };

  history.replaceState = function (...args) {
    const result = originalReplaceState.apply(this, args);
    window.postMessage({ type: 'DS_REWIND_NAVIGATION' }, '*');
    return result;
  };
})();
