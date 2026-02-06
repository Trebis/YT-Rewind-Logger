// DreamingSpanish transcript manager — three strategies:
// 1. VTT interception (MAIN world sends VTT text via postMessage)
// 2. TextTrack API (read video.textTracks cues directly)
// 3. DOM subtitle reading (last resort)
class TranscriptManager {
  constructor() {
    this.cues = null; // Array of { startMs, endMs, text }
    this.currentVideoId = null;

    // Listen for VTT data from the MAIN world interceptor
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      if (event.data?.type !== 'DS_REWIND_VTT_DATA') return;
      this._parseVTT(event.data.vttText);
    });
  }

  async loadTranscript(videoId) {
    if (!videoId) return;
    if (videoId === this.currentVideoId && this.cues) return;

    this.currentVideoId = videoId;
    this.cues = null;

    // Try TextTrack API directly (synchronous source of cues)
    await this._tryTextTrackAPI();

    if (this.cues) {
      console.log(`[YT Rewind Logger] Loaded ${this.cues.length} cues via TextTrack API`);
    } else {
      console.log('[YT Rewind Logger] No TextTrack cues found; waiting for VTT interception');
    }
    // VTT interception (from vtt-interceptor.js) will populate this.cues
    // asynchronously when the page fetches the subtitle file
  }

  async _tryTextTrackAPI() {
    // Wait briefly for video element to be ready
    const video = await this._waitForVideo(3000);
    if (!video || !video.textTracks || video.textTracks.length === 0) return;

    for (let i = 0; i < video.textTracks.length; i++) {
      const track = video.textTracks[i];

      // Look for Spanish subtitles, or any subtitle/caption track
      const isSpanish = track.language === 'es' || track.language === 'spa';
      const isSubtitle = track.kind === 'subtitles' || track.kind === 'captions';

      if (isSpanish || isSubtitle) {
        // Set to 'hidden' to load cues without showing on screen
        if (track.mode === 'disabled') {
          track.mode = 'hidden';
        }

        // Wait for cues to load
        await new Promise(resolve => setTimeout(resolve, 500));

        if (track.cues && track.cues.length > 0) {
          this.cues = Array.from(track.cues).map(cue => ({
            startMs: cue.startTime * 1000,
            endMs: cue.endTime * 1000,
            text: cue.text.replace(/<[^>]*>/g, '').trim()
          }));
          return;
        }
      }
    }
  }

  _waitForVideo(timeoutMs) {
    return new Promise((resolve) => {
      const video = document.querySelector('video');
      if (video) { resolve(video); return; }

      const timeout = setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeoutMs);

      const observer = new MutationObserver(() => {
        const v = document.querySelector('video');
        if (v) {
          observer.disconnect();
          clearTimeout(timeout);
          resolve(v);
        }
      });
      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true
      });
    });
  }

  _parseVTT(vttText) {
    const lines = vttText.split('\n');
    const cues = [];
    let i = 0;

    // Skip header lines until we find a timestamp line
    while (i < lines.length && !lines[i].includes('-->')) {
      i++;
    }

    while (i < lines.length) {
      const line = lines[i].trim();
      if (line.includes('-->')) {
        const [startStr, endStr] = line.split('-->').map(s => s.trim().split(' ')[0]); // strip position metadata
        const startMs = this._parseVTTTimestamp(startStr);
        const endMs = this._parseVTTTimestamp(endStr);

        // Collect text lines until next blank line or next cue
        i++;
        const textLines = [];
        while (i < lines.length && lines[i].trim() !== '' && !lines[i].includes('-->')) {
          // Skip cue ID lines (pure numbers)
          if (!/^\d+$/.test(lines[i].trim())) {
            textLines.push(lines[i].trim());
          }
          i++;
        }

        const text = textLines.join(' ').replace(/<[^>]*>/g, '').trim();
        if (text) {
          cues.push({ startMs, endMs, text });
        }
      } else {
        i++;
      }
    }

    if (cues.length > 0) {
      this.cues = cues;
      console.log(`[YT Rewind Logger] Loaded ${cues.length} VTT cues from interception`);
    }
  }

  _parseVTTTimestamp(str) {
    // Format: HH:MM:SS.mmm or MM:SS.mmm
    const parts = str.split(':');
    let hours = 0, minutes = 0, seconds = 0;

    if (parts.length === 3) {
      hours = parseInt(parts[0], 10);
      minutes = parseInt(parts[1], 10);
      seconds = parseFloat(parts[2]);
    } else if (parts.length === 2) {
      minutes = parseInt(parts[0], 10);
      seconds = parseFloat(parts[1]);
    }

    return (hours * 3600 + minutes * 60 + seconds) * 1000;
  }

  getWordsInRange(startSec, endSec) {
    if (!this.cues) return null;

    const startMs = startSec * 1000;
    const endMs = endSec * 1000;
    const results = [];

    for (const cue of this.cues) {
      if (cue.endMs < startMs || cue.startMs > endMs) continue;
      if (!cue.text) continue;

      const words = cue.text.split(/\s+/).filter(Boolean);
      for (const rawWord of words) {
        results.push({
          word: rawWord,
          sentence: cue.text,
          timestampMs: cue.startMs
        });
      }
    }

    return results.length > 0 ? results : null;
  }

  getVisibleCaptionText() {
    // Try common subtitle overlay selectors
    const selectors = [
      '[class*="subtitle"]',
      '[class*="caption"]',
      '.vjs-text-track-display',
      '[class*="track-text"]'
    ];

    for (const sel of selectors) {
      const elements = document.querySelectorAll(sel);
      if (elements.length > 0) {
        const text = Array.from(elements)
          .map(el => el.textContent)
          .join(' ')
          .trim();
        if (text) return text;
      }
    }

    return null;
  }
}
