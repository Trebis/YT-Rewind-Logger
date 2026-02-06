// YouTube transcript extraction with three strategies:
// 1. MAIN world bridge (reads ytInitialPlayerResponse directly from page JS context)
// 2. HTML fetch + brace-matching parse (fallback)
// 3. DOM subtitle reading (last resort)
class TranscriptManager {
  constructor() {
    this.transcriptData = null;
    this.currentVideoId = null;
    this.targetLanguage = 'es';
    this._bridgeReady = false;
    this._pendingBridgeResolve = null;
    this._cachedTracks = null;

    // Listen for caption tracks from the MAIN world bridge script
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      if (event.data?.type !== 'YT_REWIND_CAPTION_TRACKS') return;

      this._cachedTracks = event.data.tracks;
      this._bridgeReady = true;

      // Resolve any pending request
      if (this._pendingBridgeResolve) {
        this._pendingBridgeResolve(event.data.tracks);
        this._pendingBridgeResolve = null;
      }
    });
  }

  async loadTranscript(videoId) {
    if (!videoId) return;
    if (videoId === this.currentVideoId && this.transcriptData) return;

    this.currentVideoId = videoId;
    this.transcriptData = null;

    // Try bridge first, then HTML fetch fallback
    try {
      const captionTracks = await this._getCaptionTracks();
      if (captionTracks && captionTracks.length > 0) {
        await this._fetchTranscript(captionTracks);
      } else {
        console.warn('[YT Rewind Logger] No caption tracks available for this video');
      }
    } catch (err) {
      console.warn('[YT Rewind Logger] Transcript load failed:', err.message);
      this.transcriptData = null;
    }
  }

  async _getCaptionTracks() {
    // Strategy 1: Ask the bridge for caption tracks
    const bridgeTracks = await this._requestTracksFromBridge();
    if (bridgeTracks && bridgeTracks.length > 0) {
      console.log('[YT Rewind Logger] Got caption tracks from bridge');
      return bridgeTracks;
    }

    // Strategy 2: Fetch page HTML and parse ytInitialPlayerResponse
    console.log('[YT Rewind Logger] Bridge unavailable, falling back to HTML fetch');
    return await this._getTracksFromHTML();
  }

  async _requestTracksFromBridge() {
    // If we already have cached tracks from a proactive bridge message, use them
    if (this._bridgeReady && this._cachedTracks) {
      const tracks = this._cachedTracks;
      this._cachedTracks = null;
      this._bridgeReady = false;
      return tracks;
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this._pendingBridgeResolve = null;
        resolve(null);
      }, 2000);

      this._pendingBridgeResolve = (tracks) => {
        clearTimeout(timeout);
        resolve(tracks);
      };

      // Send request to the bridge
      window.postMessage({ type: 'YT_REWIND_REQUEST_CAPTIONS' }, '*');
    });
  }

  async _getTracksFromHTML() {
    const response = await fetch(window.location.href);
    const html = await response.text();

    const marker = 'ytInitialPlayerResponse';
    const markerIdx = html.indexOf(marker);
    if (markerIdx === -1) {
      throw new Error('ytInitialPlayerResponse not found in page HTML');
    }

    const braceStart = html.indexOf('{', markerIdx);
    if (braceStart === -1) {
      throw new Error('Could not find start of ytInitialPlayerResponse JSON');
    }

    // Brace-matching parser that respects quoted strings
    let depth = 0;
    let inString = false;
    let escape = false;
    let braceEnd = -1;

    for (let i = braceStart; i < html.length; i++) {
      const ch = html[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) { braceEnd = i + 1; break; }
      }
    }

    if (braceEnd === -1) {
      throw new Error('Could not find end of ytInitialPlayerResponse JSON');
    }

    const jsonStr = html.substring(braceStart, braceEnd);
    let playerResponse;
    try {
      playerResponse = JSON.parse(jsonStr);
    } catch (e) {
      throw new Error('Failed to parse ytInitialPlayerResponse JSON: ' + e.message);
    }

    return playerResponse
      ?.captions
      ?.playerCaptionsTracklistRenderer
      ?.captionTracks || null;
  }

  async _fetchTranscript(captionTracks) {
    // Priority: manual captions > auto-generated (ASR)
    const targetTrack =
      captionTracks.find(t =>
        t.languageCode === this.targetLanguage && t.kind !== 'asr'
      ) ||
      captionTracks.find(t =>
        t.languageCode === this.targetLanguage
      ) ||
      captionTracks.find(t =>
        t.vssId?.includes(`.${this.targetLanguage}`)
      );

    if (!targetTrack) {
      const available = captionTracks.map(t => t.languageCode).join(', ');
      console.warn(
        `[YT Rewind Logger] No ${this.targetLanguage} captions found. Available: ${available}`
      );
      return;
    }

    // Build URL — always force fmt=json3 regardless of what baseUrl contains
    const url = new URL(targetTrack.baseUrl);
    url.searchParams.set('fmt', 'json3');

    const transcriptResponse = await fetch(url.toString());
    if (!transcriptResponse.ok) {
      throw new Error(`Transcript fetch failed: ${transcriptResponse.status}`);
    }

    // Read as text first to handle empty/non-JSON responses gracefully
    const responseText = await transcriptResponse.text();
    if (!responseText || responseText.trim().length === 0) {
      throw new Error('Transcript response is empty');
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      throw new Error('Transcript response is not valid JSON: ' + responseText.substring(0, 100));
    }

    this.transcriptData = data.events || [];

    console.log(
      `[YT Rewind Logger] Loaded ${this.transcriptData.length} transcript events ` +
      `(${targetTrack.languageCode}, ${targetTrack.kind === 'asr' ? 'auto' : 'manual'})`
    );
  }

  getWordsInRange(startSec, endSec) {
    if (!this.transcriptData) return null;

    const startMs = startSec * 1000;
    const endMs = endSec * 1000;
    const results = [];

    for (const event of this.transcriptData) {
      const eventStart = event.tStartMs || 0;
      const eventDuration = event.dDurationMs || 0;
      const eventEnd = eventStart + eventDuration;

      if (eventEnd < startMs || eventStart > endMs) continue;
      if (!event.segs || event.segs.length === 0) continue;

      const sentence = event.segs
        .map(seg => seg.utf8 || '')
        .join('')
        .replace(/\n/g, ' ')
        .trim();

      if (!sentence) continue;

      for (const seg of event.segs) {
        const text = (seg.utf8 || '').trim();
        if (!text || text === '\n') continue;

        const words = text.split(/\s+/).filter(Boolean);
        for (const rawWord of words) {
          results.push({
            word: rawWord,
            sentence: sentence,
            timestampMs: eventStart + (seg.tOffsetMs || 0)
          });
        }
      }
    }

    return results.length > 0 ? results : null;
  }

  getVisibleCaptionText() {
    const segments = document.querySelectorAll('.ytp-caption-segment');
    if (segments.length === 0) return null;

    const text = Array.from(segments)
      .map(el => el.textContent)
      .join(' ')
      .trim();

    return text || null;
  }
}
