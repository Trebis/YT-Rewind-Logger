// Runs in the page's MAIN world (not the extension's isolated world).
// This gives direct access to window.ytInitialPlayerResponse which
// contains the caption track URLs needed for transcript extraction.
(function () {
  function sendCaptionTracks() {
    try {
      const pr = window.ytInitialPlayerResponse;
      const tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks || null;
      window.postMessage({
        type: 'YT_REWIND_CAPTION_TRACKS',
        tracks: tracks
      }, '*');
    } catch (e) {
      window.postMessage({
        type: 'YT_REWIND_CAPTION_TRACKS',
        tracks: null
      }, '*');
    }
  }

  // Send immediately on load
  sendCaptionTracks();

  // Re-send after YouTube SPA navigation (variable gets updated)
  document.addEventListener('yt-navigate-finish', () => {
    setTimeout(sendCaptionTracks, 500);
  });

  // Listen for on-demand requests from the content script
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.type === 'YT_REWIND_REQUEST_CAPTIONS') {
      sendCaptionTracks();
    }
  });
})();
