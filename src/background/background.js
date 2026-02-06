import { openDB, idbGet, idbPut, idbAdd, idbDelete, idbGetAll, idbGetAllByIndex } from './db.js';

// Session state
let activeSessionId = null;

// Initialize: restore session state from storage
chrome.storage.local.get(['activeSessionId'], (result) => {
  if (result.activeSessionId) {
    activeSessionId = result.activeSessionId;
    updateBadge(true);
  }
});

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch(err => {
      console.error('[YT Rewind Logger BG]', err);
      sendResponse({ error: err.message });
    });
  return true; // keep channel open for async response
});

async function handleMessage(message, sender) {
  const db = await openDB();

  switch (message.type) {
    case 'LOG_WORDS':
      return handleLogWords(db, message.payload);
    case 'GET_WORDS':
      return handleGetWords(db, message.payload);
    case 'UPDATE_WORD':
      return handleUpdateWord(db, message.payload);
    case 'DELETE_WORD':
      return handleDeleteWord(db, message.payload);
    case 'GET_CONTEXTS':
      return handleGetContexts(db, message.payload);
    case 'EXPORT_ANKI':
      return handleExportAnki(db, message.payload);
    case 'GET_STATS':
      return handleGetStats(db);
    case 'START_SESSION':
      return handleStartSession(db);
    case 'STOP_SESSION':
      return handleStopSession(db);
    case 'GET_SESSION_STATE':
      return { active: activeSessionId !== null, sessionId: activeSessionId };
    default:
      return { error: 'Unknown message type: ' + message.type };
  }
}

// --- Word Logging ---

async function handleLogWords(db, payload) {
  const { words, videoId, videoTitle, language } = payload;
  const tx = db.transaction(['words', 'contexts', 'sessions'], 'readwrite');
  const wordStore = tx.objectStore('words');
  const ctxStore = tx.objectStore('contexts');
  const sessStore = tx.objectStore('sessions');

  let newWords = 0;
  let updatedWords = 0;

  for (const entry of words) {
    const wordId = `${language}:${entry.word}`;
    const existing = await idbGet(wordStore, wordId);

    if (existing) {
      existing.encounters += 1;
      existing.lastSeen = Date.now();
      await idbPut(wordStore, existing);
      updatedWords++;
    } else {
      await idbPut(wordStore, {
        id: wordId,
        word: entry.word,
        language: language,
        encounters: 1,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        learned: false,
        excluded: false,
        masteryLevel: 0
      });
      newWords++;
    }

    // Store context sentence (deduplicate by checking recent entries)
    if (entry.sentence) {
      await idbAdd(ctxStore, {
        wordId: wordId,
        sentence: entry.sentence,
        videoId: videoId,
        videoTitle: videoTitle || '',
        timestampMs: entry.timestampMs || 0,
        capturedAt: Date.now()
      });
    }
  }

  // Update active session stats
  if (activeSessionId) {
    try {
      const session = await idbGet(sessStore, activeSessionId);
      if (session) {
        session.wordsEncountered += words.length;
        session.newWords += newWords;
        session.rewinds += 1;
        if (videoId && !session.videoIds.includes(videoId)) {
          session.videoIds.push(videoId);
        }
        session.endTime = Date.now();
        await idbPut(sessStore, session);
      }
    } catch (e) {
      console.warn('[YT Rewind Logger BG] Session update failed:', e);
    }
  }

  return { newWords, updatedWords, totalLogged: words.length };
}

// --- Word Queries ---

async function handleGetWords(db, payload = {}) {
  const tx = db.transaction('words', 'readonly');
  const store = tx.objectStore('words');
  let words = await idbGetAll(store);

  // Apply filters
  const { filter, search, sort } = payload;

  if (filter === 'known') {
    words = words.filter(w => w.masteryLevel === 2 && !w.excluded);
  } else if (filter === 'learning') {
    words = words.filter(w => w.masteryLevel === 1 && !w.excluded);
  } else if (filter === 'new') {
    words = words.filter(w => w.masteryLevel === 0 && !w.excluded);
  } else if (filter === 'excluded') {
    words = words.filter(w => w.excluded);
  } else if (filter !== 'all') {
    // Default: show New + Learning (in progress)
    words = words.filter(w => !w.excluded && w.masteryLevel < 2);
  }

  // Search
  if (search) {
    const q = search.toLowerCase();
    words = words.filter(w => w.word.includes(q));
  }

  // Sort
  if (sort === 'alpha') {
    words.sort((a, b) => a.word.localeCompare(b.word));
  } else if (sort === 'recent') {
    words.sort((a, b) => b.lastSeen - a.lastSeen);
  } else if (sort === 'mastery') {
    words.sort((a, b) => b.masteryLevel - a.masteryLevel || b.encounters - a.encounters);
  } else {
    // Default: frequency (most encountered first)
    words.sort((a, b) => b.encounters - a.encounters);
  }

  return { words };
}

// --- Word Updates ---

async function handleUpdateWord(db, payload) {
  const { wordId, updates } = payload;
  const tx = db.transaction('words', 'readwrite');
  const store = tx.objectStore('words');
  const word = await idbGet(store, wordId);

  if (!word) return { error: 'Word not found' };

  // Apply allowed updates
  if ('masteryLevel' in updates) {
    word.masteryLevel = Math.max(0, Math.min(2, updates.masteryLevel));
  }
  if ('excluded' in updates) {
    word.excluded = updates.excluded;
  }

  await idbPut(store, word);
  return { word };
}

// --- Word Deletion ---

async function handleDeleteWord(db, payload) {
  const { wordId } = payload;
  const tx = db.transaction(['words', 'contexts'], 'readwrite');
  await idbDelete(tx.objectStore('words'), wordId);

  // Also delete associated contexts
  const ctxStore = tx.objectStore('contexts');
  const contexts = await idbGetAllByIndex(ctxStore, 'by_wordId', wordId);
  for (const ctx of contexts) {
    await idbDelete(ctxStore, ctx.id);
  }

  return { deleted: true };
}

// --- Context Sentences ---

async function handleGetContexts(db, payload) {
  const { wordId } = payload;
  const tx = db.transaction('contexts', 'readonly');
  const contexts = await idbGetAllByIndex(tx.objectStore('contexts'), 'by_wordId', wordId);
  // Return most recent first, limit to 10
  contexts.sort((a, b) => b.capturedAt - a.capturedAt);
  return { contexts: contexts.slice(0, 10) };
}

// --- Anki Export ---

async function handleExportAnki(db) {
  const tx = db.transaction(['words', 'contexts'], 'readonly');
  const wordStore = tx.objectStore('words');
  const ctxStore = tx.objectStore('contexts');

  const allWords = await idbGetAll(wordStore);
  const masteryLabels = ['new', 'seen', 'familiar', 'learned', 'mastered'];

  const lines = [
    '#separator:tab',
    '#html:false',
    '#deck:YT Rewind Logger - Spanish',
    '#tags column:3'
  ];

  for (const word of allWords) {
    // Skip excluded and already-learned words
    if (word.excluded || word.learned) continue;

    // Get most recent context sentence
    const contexts = await idbGetAllByIndex(ctxStore, 'by_wordId', word.id);
    contexts.sort((a, b) => b.capturedAt - a.capturedAt);
    const bestContext = contexts[0];

    const front = word.word;
    let back = '(no context)';
    if (bestContext) {
      const timeStr = formatTimestamp(bestContext.timestampMs);
      const title = bestContext.videoTitle || 'Unknown video';
      back = `"${bestContext.sentence}" (${title}, ${timeStr})`;
    }

    const mastery = masteryLabels[word.masteryLevel] || 'new';
    const tags = `mastery::${mastery} encounters::${word.encounters}`;

    lines.push(`${front}\t${back}\t${tags}`);
  }

  return { tsv: lines.join('\n'), wordCount: lines.length - 4 };
}

function formatTimestamp(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

// --- Session Management ---

async function handleStartSession(db) {
  const tx = db.transaction('sessions', 'readwrite');
  const store = tx.objectStore('sessions');

  const session = {
    date: new Date().toISOString().split('T')[0],
    startTime: Date.now(),
    endTime: Date.now(),
    wordsEncountered: 0,
    newWords: 0,
    rewinds: 0,
    videoIds: []
  };

  const id = await idbAdd(store, session);
  activeSessionId = id;

  // Persist session state
  await chrome.storage.local.set({ activeSessionId: id });

  updateBadge(true);
  broadcastSessionState(true);

  return { active: true, sessionId: id };
}

async function handleStopSession(db) {
  if (activeSessionId) {
    const tx = db.transaction('sessions', 'readwrite');
    const store = tx.objectStore('sessions');
    const session = await idbGet(store, activeSessionId);
    if (session) {
      session.endTime = Date.now();
      await idbPut(store, session);
    }
  }

  activeSessionId = null;
  await chrome.storage.local.remove('activeSessionId');

  updateBadge(false);
  broadcastSessionState(false);

  return { active: false };
}

// --- Stats ---

async function handleGetStats(db) {
  const tx = db.transaction(['words', 'sessions'], 'readonly');
  const words = await idbGetAll(tx.objectStore('words'));
  const sessions = await idbGetAll(tx.objectStore('sessions'));

  const activeWords = words.filter(w => !w.excluded);
  const totalWords = activeWords.length;
  const learnedWords = activeWords.filter(w => w.learned || w.masteryLevel >= 3).length;
  const totalEncounters = activeWords.reduce((sum, w) => sum + w.encounters, 0);

  // Current session stats
  let currentSession = null;
  if (activeSessionId) {
    const sessStore = tx.objectStore('sessions');
    currentSession = await idbGet(sessStore, activeSessionId);
  }

  return {
    totalWords,
    learnedWords,
    totalEncounters,
    totalSessions: sessions.length,
    currentSession
  };
}

// --- Helpers ---

function updateBadge(active) {
  if (active) {
    chrome.action.setBadgeText({ text: 'ON' });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

function broadcastSessionState(active) {
  const patterns = ['*://*.youtube.com/*', '*://app.dreaming.com/*'];
  for (const pattern of patterns) {
    chrome.tabs.query({ url: pattern }, (tabs) => {
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'SESSION_STATE_CHANGED',
          active: active
        }).catch(() => {});
      }
    });
  }
}
