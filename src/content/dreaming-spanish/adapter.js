// DreamingSpanish SiteAdapter — provides video metadata, SPA navigation, and subtitle check
class SiteAdapter {
  getVideoId() {
    // URL format: /spanish/watch?id=685ea1e336c20dd2ccabc5f5
    return new URLSearchParams(window.location.search).get('id');
  }

  getVideoTitle() {
    return document.querySelector('h1')?.textContent?.trim()
      || document.title.replace(/\s*[-–|].*$/, '').trim();
  }

  onNavigate(callback) {
    // Listen for navigation events dispatched by the MAIN world interceptor
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      if (event.data?.type === 'DS_REWIND_NAVIGATION') {
        callback();
      }
    });

    // Also listen for popstate (browser back/forward)
    window.addEventListener('popstate', () => callback());
  }

  checkSubtitles() {
    // DreamingSpanish subtitle state detection.
    // Try to detect if video has text tracks and if any are active.
    const video = document.querySelector('video');
    if (!video || !video.textTracks || video.textTracks.length === 0) {
      return null; // can't determine — no video or no tracks
    }

    const activeTracks = Array.from(video.textTracks)
      .filter(t => t.mode === 'showing');

    if (activeTracks.length > 0) {
      return { enabled: true, message: '' };
    }

    // Check if any tracks exist but none are showing
    const hasTracks = video.textTracks.length > 0;
    if (hasTracks) {
      return {
        enabled: false,
        message: 'Subtitles are available but not enabled — turn them on for word tracking!'
      };
    }

    return null;
  }
}
