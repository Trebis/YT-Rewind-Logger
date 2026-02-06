# YT Rewind Logger

A Chrome extension for Spanish language learners that tracks vocabulary every time you rewind a video on YouTube or DreamingSpanish.

## How It Works

1. Start a session from the extension popup
2. Watch a Spanish video with subtitles enabled
3. Every time you rewind (ArrowLeft on YouTube, seeking backward on DreamingSpanish), the extension captures the words from that subtitle segment
4. Review your vocabulary in the popup — filter stop words, see context sentences, and export to Anki

## Features

- **Rewind-based tracking** — only logs words from moments you replayed, focusing on what you're actively learning
- **Context sentences** — see each word in the subtitle line where it appeared
- **Stop word filtering** — hide common words (el, de, que, etc.) to focus on new vocabulary
- **Anki export** — export your word list for spaced repetition study
- **Session management** — manually start/stop sessions to control when tracking is active

## Supported Sites

| Site | Rewind Detection | Transcript Source |
|------|-----------------|-------------------|
| YouTube | ArrowLeft key | Timed text API / DOM fallback |
| DreamingSpanish | Backward seek on video | VTT subtitle interception |

## Installation

1. Clone or download this repository
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the project folder
5. Navigate to a YouTube or DreamingSpanish video and click the extension icon to start a session

## Project Structure

```
src/
├── background/        # Service worker + IndexedDB storage
├── content/
│   ├── youtube/       # YouTube adapter, transcript, rewind detection
│   ├── dreaming-spanish/  # DreamingSpanish adapter, VTT interception
│   ├── content.js     # Shared orchestrator
│   └── word-processor.js  # Word extraction and normalization
├── popup/             # Extension popup UI
└── shared/            # Shared constants
```

## Tech Stack

- Chrome Extension Manifest V3
- Vanilla JavaScript (no frameworks)
- IndexedDB for local storage
