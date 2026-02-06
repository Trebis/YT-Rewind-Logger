// Message types for content script <-> background communication
const MSG = {
  LOG_WORDS: 'LOG_WORDS',
  GET_WORDS: 'GET_WORDS',
  UPDATE_WORD: 'UPDATE_WORD',
  DELETE_WORD: 'DELETE_WORD',
  GET_CONTEXTS: 'GET_CONTEXTS',
  EXPORT_ANKI: 'EXPORT_ANKI',
  GET_STATS: 'GET_STATS',
  START_SESSION: 'START_SESSION',
  STOP_SESSION: 'STOP_SESSION',
  GET_SESSION_STATE: 'GET_SESSION_STATE',
  SESSION_STATE_CHANGED: 'SESSION_STATE_CHANGED'
};

// Spanish stop words — common function words that add noise to vocabulary tracking
const STOP_WORDS_ES = new Set([
  'a', 'al', 'algo', 'con', 'de', 'del', 'el', 'en', 'es', 'eso',
  'esta', 'este', 'esto', 'hay', 'la', 'las', 'le', 'les', 'lo',
  'los', 'me', 'mi', 'muy', 'más', 'no', 'nos', 'o', 'para', 'pero',
  'por', 'que', 'qué', 'se', 'si', 'sin', 'su', 'sus', 'sí', 'te',
  'tu', 'tú', 'un', 'una', 'y', 'ya', 'yo'
]);

// Mastery level thresholds
const MASTERY = {
  NEW: 0,        // < 3 encounters
  SEEN: 1,       // 3+ encounters
  FAMILIAR: 2,   // 10+ encounters
  LEARNED: 3,    // 20+ encounters
  MASTERED: 4    // user-confirmed
};

const MASTERY_LABELS = ['New', 'Seen', 'Familiar', 'Learned', 'Mastered'];

const MASTERY_THRESHOLDS = [0, 3, 10, 20, Infinity];

function calculateMastery(encounters, userMarkedLearned) {
  if (userMarkedLearned) return MASTERY.MASTERED;
  if (encounters >= 20) return MASTERY.LEARNED;
  if (encounters >= 10) return MASTERY.FAMILIAR;
  if (encounters >= 3) return MASTERY.SEEN;
  return MASTERY.NEW;
}
