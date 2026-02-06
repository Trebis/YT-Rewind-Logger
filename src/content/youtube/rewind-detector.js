// Detects left-arrow key presses on YouTube (5-second rewind)
class RewindDetector {
  constructor(onRewind) {
    this.onRewind = onRewind;
    this.enabled = false;
  }

  start() {
    document.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.key !== 'ArrowLeft') return;

      const video = document.querySelector('video');
      if (!video) return;

      // Ignore if user is typing in a text field
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) {
        return;
      }

      // currentTime is captured BEFORE YouTube processes the rewind
      const currentTime = video.currentTime;
      const segmentStart = Math.max(0, currentTime - 5);
      const segmentEnd = currentTime;

      this.onRewind(segmentStart, segmentEnd);
    }, true); // capture phase to intercept before YouTube's handler
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }
}
