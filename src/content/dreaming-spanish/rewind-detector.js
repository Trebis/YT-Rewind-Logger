// DreamingSpanish RewindDetector — detects backward seeks on the HTML5 video element.
// Works with any rewind method: keyboard shortcut, progress bar click, UI buttons.
class RewindDetector {
  constructor(onRewind) {
    this.onRewind = onRewind;
    this.enabled = false;
    this._lastTime = 0;
    this._video = null;
    this._bound = {
      onTimeUpdate: this._onTimeUpdate.bind(this),
      onSeeking: this._onSeeking.bind(this)
    };
  }

  start() {
    this._findAndAttach();
  }

  _findAndAttach() {
    const video = document.querySelector('video');
    if (video) {
      this._attach(video);
      return;
    }

    // Wait for video element to appear (React SPA may create it dynamically)
    const observer = new MutationObserver(() => {
      const v = document.querySelector('video');
      if (v) {
        observer.disconnect();
        this._attach(v);
      }
    });
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  _attach(video) {
    // Detach from previous video if any
    if (this._video) {
      this._video.removeEventListener('timeupdate', this._bound.onTimeUpdate);
      this._video.removeEventListener('seeking', this._bound.onSeeking);
    }

    this._video = video;
    this._lastTime = video.currentTime;
    video.addEventListener('timeupdate', this._bound.onTimeUpdate);
    video.addEventListener('seeking', this._bound.onSeeking);

    // Re-attach if video element is replaced (React SPA may swap DOM)
    const observer = new MutationObserver(() => {
      if (!document.contains(this._video)) {
        observer.disconnect();
        this._video = null;
        this._findAndAttach();
      }
    });
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  _onTimeUpdate() {
    if (this._video) {
      this._lastTime = this._video.currentTime;
    }
  }

  _onSeeking() {
    if (!this.enabled || !this._video) return;

    const currentTime = this._video.currentTime;
    const previousTime = this._lastTime;

    // Detect backward seek: current position at least 1 second behind last known position
    if (previousTime - currentTime > 1) {
      const segmentStart = currentTime;
      const segmentEnd = previousTime;
      this.onRewind(segmentStart, segmentEnd);
    }
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }
}
