// YouTube SiteAdapter — provides video metadata, SPA navigation, and subtitle check
class SiteAdapter {
  getVideoId() {
    return new URLSearchParams(window.location.search).get('v');
  }

  getVideoTitle() {
    return document.querySelector('yt-formatted-string.ytd-watch-metadata')?.textContent
      || document.title;
  }

  onNavigate(callback) {
    // Primary: YouTube's custom SPA navigation event
    document.addEventListener('yt-navigate-finish', () => callback());

    // Backup: MutationObserver on <title> watching for ?v= param changes
    let lastVideoId = this.getVideoId();
    const titleEl = document.querySelector('title');
    if (titleEl) {
      new MutationObserver(() => {
        const currentVideoId = this.getVideoId();
        if (currentVideoId && currentVideoId !== lastVideoId) {
          lastVideoId = currentVideoId;
          callback();
        }
      }).observe(titleEl, { childList: true });
    }
  }

  checkSubtitles() {
    const btn = document.querySelector('.ytp-subtitles-button');
    if (!btn) return null; // no subtitle button = can't determine
    return {
      enabled: btn.getAttribute('aria-pressed') === 'true',
      message: 'Subtitles (CC) are off — turn them on for word tracking!'
    };
  }
}
