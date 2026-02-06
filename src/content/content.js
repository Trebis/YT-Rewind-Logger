// Content script orchestrator — wires together rewind detection, transcript reading, and word processing.
// Site-specific classes (SiteAdapter, TranscriptManager, RewindDetector) are provided by
// per-site scripts that load before this file. They share global scope — no imports needed.
(async function () {
  const LOG_PREFIX = '[YT Rewind Logger]';

  // Load user settings
  const settings = await chrome.storage.sync.get({
    filterStopWords: true
  });

  const adapter = new SiteAdapter();
  const processor = new WordProcessor();
  const transcript = new TranscriptManager();

  // Check session state from background
  let sessionActive = false;

  async function checkSessionState() {
    try {
      const response = await chrome.runtime.sendMessage({ type: MSG.GET_SESSION_STATE });
      sessionActive = response?.active || false;
      detector.setEnabled(sessionActive);

      // Check subtitles when session becomes active
      if (sessionActive) {
        checkAndWarnSubtitles();
      }
    } catch (e) {
      console.warn(LOG_PREFIX, 'Could not check session state:', e.message);
    }
  }

  // Listen for session state changes from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === MSG.SESSION_STATE_CHANGED) {
      sessionActive = message.active;
      detector.setEnabled(sessionActive);

      if (sessionActive) {
        checkAndWarnSubtitles();
      }
    }
  });

  // Load transcript for the current video
  const initialVideoId = adapter.getVideoId();
  await transcript.loadTranscript(initialVideoId);

  // Handle SPA navigation via adapter
  adapter.onNavigate(() => {
    const videoId = adapter.getVideoId();
    transcript.loadTranscript(videoId);
    checkSessionState();
  });

  // Set up rewind detection
  const detector = new RewindDetector(async (startSec, endSec) => {
    // Check subtitles on each rewind
    checkAndWarnSubtitles();

    let wordEntries = transcript.getWordsInRange(startSec, endSec);

    // Fallback to DOM subtitle reading
    if (!wordEntries) {
      const visibleText = transcript.getVisibleCaptionText();
      if (!visibleText) {
        console.log(LOG_PREFIX, 'No transcript data available for this segment');
        return;
      }
      const tokens = processor.tokenize(visibleText);
      wordEntries = tokens.map(w => ({
        word: w,
        sentence: visibleText,
        timestampMs: startSec * 1000
      }));
    } else {
      // Normalize words from transcript
      wordEntries = wordEntries
        .map(entry => ({
          ...entry,
          word: processor.normalize(entry.word)
        }))
        .filter(entry => entry.word.length > 0);
    }

    // Filter stop words if enabled
    if (settings.filterStopWords) {
      wordEntries = wordEntries.filter(e => !processor.isStopWord(e.word));
    }

    if (wordEntries.length === 0) {
      console.log(LOG_PREFIX, 'No words to log (all filtered or empty segment)');
      return;
    }

    // Get video metadata from adapter
    const videoId = adapter.getVideoId();
    const videoTitle = adapter.getVideoTitle();

    // Send to background for storage
    try {
      const result = await chrome.runtime.sendMessage({
        type: MSG.LOG_WORDS,
        payload: {
          words: wordEntries,
          videoId,
          videoTitle,
          language: 'es'
        }
      });

      console.log(LOG_PREFIX, `Logged ${wordEntries.length} words:`,
        wordEntries.map(e => e.word).join(', '));

      showRewindIndicator(wordEntries.length, result?.newWords || 0);
    } catch (e) {
      console.error(LOG_PREFIX, 'Failed to log words:', e.message);
    }
  });

  detector.start();
  checkSessionState();

  // --- Subtitle Check ---

  let lastSubtitleWarningTime = 0;

  function checkAndWarnSubtitles() {
    const result = adapter.checkSubtitles();
    if (result === null) return; // site doesn't support subtitle check

    if (!result.enabled) {
      // Throttle: max once per 30 seconds
      const now = Date.now();
      if (now - lastSubtitleWarningTime < 30000) return;
      lastSubtitleWarningTime = now;

      showWarningToast(result.message);
    }
  }

  // --- Visual Toasts ---

  function showWarningToast(message) {
    let toast = document.getElementById('yt-rewind-warning-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'yt-rewind-warning-toast';
      toast.style.cssText = `
        position: fixed;
        top: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.9);
        color: #FFC107;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 14px;
        font-family: 'Roboto', Arial, sans-serif;
        z-index: 99999;
        transition: opacity 0.3s ease;
        pointer-events: none;
        border: 1px solid rgba(255, 193, 7, 0.4);
        max-width: 400px;
        text-align: center;
      `;
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.opacity = '1';

    clearTimeout(toast._hideTimeout);
    toast._hideTimeout = setTimeout(() => {
      toast.style.opacity = '0';
    }, 4000);
  }

  function showRewindIndicator(totalWords, newWords) {
    let indicator = document.getElementById('yt-rewind-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'yt-rewind-indicator';
      indicator.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        background: rgba(0, 0, 0, 0.85);
        color: #4CAF50;
        padding: 10px 18px;
        border-radius: 8px;
        font-size: 14px;
        font-family: 'Roboto', Arial, sans-serif;
        z-index: 99999;
        transition: opacity 0.3s ease;
        pointer-events: none;
        border: 1px solid rgba(76, 175, 80, 0.3);
      `;
      document.body.appendChild(indicator);
    }

    const newLabel = newWords > 0 ? ` (${newWords} new)` : '';
    indicator.textContent = `+${totalWords} words logged${newLabel}`;
    indicator.style.opacity = '1';

    clearTimeout(indicator._hideTimeout);
    indicator._hideTimeout = setTimeout(() => {
      indicator.style.opacity = '0';
    }, 2000);
  }
})();
