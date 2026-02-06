// Popup logic — data-dense word table with session controls

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// DOM refs
const sessionBtn = $('#session-btn');
const sessionIcon = $('#session-icon');
const sessionLabel = $('#session-label');
const sessionBar = $('#session-bar');
const statWords = $('#stat-words');
const statNew = $('#stat-new');
const statRewinds = $('#stat-rewinds');
const searchInput = $('#search-input');
const filterSelect = $('#filter-select');
const sortSelect = $('#sort-select');
const stopwordsToggle = $('#stopwords-toggle');
const totalCount = $('#total-count');
const wordTbody = $('#word-tbody');
const emptyState = $('#empty-state');
const exportBtn = $('#export-btn');

let sessionActive = false;
let expandedWordId = null;

// --- Init ---

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await refreshSessionState();
  await refreshWordList();

  // Event listeners
  sessionBtn.addEventListener('click', toggleSession);
  searchInput.addEventListener('input', debounce(refreshWordList, 200));
  filterSelect.addEventListener('change', refreshWordList);
  sortSelect.addEventListener('change', refreshWordList);
  stopwordsToggle.addEventListener('change', saveSettings);
  exportBtn.addEventListener('click', exportAnki);
});

// --- Settings ---

async function loadSettings() {
  const settings = await chrome.storage.sync.get({ filterStopWords: true });
  stopwordsToggle.checked = settings.filterStopWords;
}

async function saveSettings() {
  await chrome.storage.sync.set({
    filterStopWords: stopwordsToggle.checked
  });
}

// --- Session ---

async function refreshSessionState() {
  try {
    const response = await chrome.runtime.sendMessage({ type: MSG.GET_SESSION_STATE });
    sessionActive = response?.active || false;
    updateSessionUI();

    if (sessionActive) {
      const stats = await chrome.runtime.sendMessage({ type: MSG.GET_STATS });
      if (stats.currentSession) {
        updateSessionStats(stats.currentSession);
      }
    }
  } catch (e) {
    console.warn('Session state check failed:', e);
  }
}

async function toggleSession() {
  try {
    if (sessionActive) {
      await chrome.runtime.sendMessage({ type: MSG.STOP_SESSION });
      sessionActive = false;
    } else {
      await chrome.runtime.sendMessage({ type: MSG.START_SESSION });
      sessionActive = true;
    }
    updateSessionUI();
  } catch (e) {
    console.error('Session toggle failed:', e);
  }
}

function updateSessionUI() {
  if (sessionActive) {
    sessionBtn.classList.add('active');
    sessionIcon.textContent = '\u25A0'; // stop square
    sessionLabel.textContent = 'Stop';
    sessionBar.classList.remove('hidden');
  } else {
    sessionBtn.classList.remove('active');
    sessionIcon.textContent = '\u25B6'; // play triangle
    sessionLabel.textContent = 'Start';
    sessionBar.classList.add('hidden');
  }
}

function updateSessionStats(session) {
  statWords.textContent = `${session.wordsEncountered} words`;
  statNew.textContent = `${session.newWords} new`;
  statRewinds.textContent = `${session.rewinds} rewinds`;
}

// --- Word List ---

async function refreshWordList() {
  const filter = filterSelect.value;
  const sort = sortSelect.value;
  const search = searchInput.value.trim();

  try {
    const response = await chrome.runtime.sendMessage({
      type: MSG.GET_WORDS,
      payload: { filter, sort, search }
    });

    const words = response?.words || [];
    renderWordTable(words);
    totalCount.textContent = `${words.length} words`;

    if (words.length === 0) {
      emptyState.classList.remove('hidden');
    } else {
      emptyState.classList.add('hidden');
    }
  } catch (e) {
    console.error('Failed to load words:', e);
  }
}

function renderWordTable(words) {
  wordTbody.innerHTML = '';

  for (const word of words) {
    const row = document.createElement('tr');
    row.dataset.wordId = word.id;

    row.innerHTML = `
      <td class="col-word" title="${escapeHtml(word.word)}">${escapeHtml(word.word)}</td>
      <td class="col-count">${word.encounters}</td>
      <td class="col-mastery">${renderMasteryDots(word.masteryLevel)}</td>
      <td class="col-first">${formatDate(word.firstSeen)}</td>
      <td class="col-last">${formatDate(word.lastSeen)}</td>
      <td class="col-actions">
        <button class="action-btn learned ${word.learned ? 'active' : ''}"
                data-action="learned" title="Mark as learned">&#10003;</button>
        <button class="action-btn exclude ${word.excluded ? 'active' : ''}"
                data-action="exclude" title="Exclude from tracking">&#10005;</button>
      </td>
    `;

    // Click row to expand context
    row.addEventListener('click', (e) => {
      if (e.target.closest('.action-btn')) return;
      toggleContext(word.id, row);
    });

    // Action buttons
    row.querySelectorAll('.action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleAction(word.id, btn.dataset.action);
      });
    });

    wordTbody.appendChild(row);

    // If this word was expanded, re-expand it
    if (word.id === expandedWordId) {
      loadAndShowContext(word.id, row);
    }
  }
}

function renderMasteryDots(level) {
  let html = '<div class="mastery-dots">';
  for (let i = 0; i < 5; i++) {
    const filled = i < level + 1 ? 'filled' : '';
    const levelClass = level >= 3 ? `level-${level}` : '';
    html += `<span class="mastery-dot ${filled} ${levelClass}"></span>`;
  }
  html += '</div>';
  return html;
}

// --- Context Expansion ---

async function toggleContext(wordId, row) {
  const existingContext = row.nextElementSibling;
  if (existingContext?.classList.contains('context-row')) {
    existingContext.remove();
    row.classList.remove('expanded');
    expandedWordId = null;
    return;
  }

  // Collapse any other expanded row
  const prevExpanded = wordTbody.querySelector('.context-row');
  if (prevExpanded) {
    prevExpanded.previousElementSibling?.classList.remove('expanded');
    prevExpanded.remove();
  }

  expandedWordId = wordId;
  row.classList.add('expanded');
  loadAndShowContext(wordId, row);
}

async function loadAndShowContext(wordId, row) {
  // Insert loading row
  const contextRow = document.createElement('tr');
  contextRow.classList.add('context-row');
  contextRow.innerHTML = `<td colspan="6"><div class="context-loading">Loading contexts...</div></td>`;
  row.after(contextRow);

  try {
    const response = await chrome.runtime.sendMessage({
      type: MSG.GET_CONTEXTS,
      payload: { wordId }
    });

    const contexts = response?.contexts || [];
    if (contexts.length === 0) {
      contextRow.innerHTML = `<td colspan="6"><div class="context-loading">No context sentences recorded.</div></td>`;
      return;
    }

    const word = wordId.split(':')[1]; // extract word from 'es:word'
    let html = '<td colspan="6"><div class="context-content">';
    for (const ctx of contexts.slice(0, 5)) {
      const highlighted = highlightWord(ctx.sentence, word);
      const time = formatTimestamp(ctx.timestampMs);
      const title = escapeHtml(ctx.videoTitle || 'Unknown video');
      html += `
        <div class="context-sentence">${highlighted}</div>
        <div class="context-meta">${title} &mdash; ${time}</div>
      `;
    }
    html += '</div></td>';
    contextRow.innerHTML = html;
  } catch (e) {
    contextRow.innerHTML = `<td colspan="6"><div class="context-loading">Failed to load contexts.</div></td>`;
  }
}

// --- Actions ---

async function handleAction(wordId, action) {
  try {
    if (action === 'learned') {
      const response = await chrome.runtime.sendMessage({
        type: MSG.GET_WORDS,
        payload: { filter: 'all', search: '' }
      });
      const word = response?.words?.find(w => w.id === wordId);
      await chrome.runtime.sendMessage({
        type: MSG.UPDATE_WORD,
        payload: { wordId, updates: { learned: !word?.learned } }
      });
    } else if (action === 'exclude') {
      const response = await chrome.runtime.sendMessage({
        type: MSG.GET_WORDS,
        payload: { filter: 'all', search: '' }
      });
      const word = response?.words?.find(w => w.id === wordId);
      await chrome.runtime.sendMessage({
        type: MSG.UPDATE_WORD,
        payload: { wordId, updates: { excluded: !word?.excluded } }
      });
    }
    await refreshWordList();
  } catch (e) {
    console.error('Action failed:', e);
  }
}

// --- Anki Export ---

async function exportAnki() {
  try {
    const response = await chrome.runtime.sendMessage({ type: MSG.EXPORT_ANKI });
    if (!response?.tsv) {
      alert('No words to export.');
      return;
    }

    // Create and download file
    const blob = new Blob(['\uFEFF' + response.tsv], { type: 'text/tab-separated-values;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `yt-rewind-logger-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);

    exportBtn.textContent = `Exported ${response.wordCount} words`;
    setTimeout(() => { exportBtn.textContent = 'Export Anki'; }, 2000);
  } catch (e) {
    console.error('Export failed:', e);
    alert('Export failed. See console for details.');
  }
}

// --- Utilities ---

function formatDate(timestamp) {
  if (!timestamp) return '-';
  const d = new Date(timestamp);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function formatTimestamp(ms) {
  if (!ms) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function highlightWord(sentence, word) {
  const escaped = escapeHtml(sentence);
  // Case-insensitive highlight
  const regex = new RegExp(`(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return escaped.replace(regex, '<span class="highlight">$1</span>');
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
