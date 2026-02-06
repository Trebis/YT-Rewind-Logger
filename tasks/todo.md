# YT Rewind Logger - Build Tasks

## Phase 1: Core MVP
- [x] Project skeleton (manifest, dirs, icons)
- [x] Rewind detection (rewind-detector.js + content.js)
- [x] Transcript extraction (transcript.js)
- [x] Word processing (word-processor.js)
- [x] Database + background (db.js + background.js)
- [x] Popup UI (popup.html/js/css)
- [x] Anki export + visual polish

## Phase 1.1: Multi-Site + Subtitle Check
- [x] Refactor to adapter pattern (SiteAdapter, per-site RewindDetector/TranscriptManager)
- [x] Move YouTube scripts to youtube/ subdirectory
- [x] Create YouTube adapter (adapter.js with getVideoId, getVideoTitle, onNavigate, checkSubtitles)
- [x] Add subtitle check notification (amber toast on YouTube when CC is off)
- [x] Create DreamingSpanish VTT interceptor (MAIN world fetch/XHR monkey-patch)
- [x] Create DreamingSpanish transcript manager (TextTrack API + VTT parsing)
- [x] Create DreamingSpanish rewind detector (video seeking event detection)
- [x] Create DreamingSpanish adapter (getVideoId from ?id=, SPA navigation via history interception)
- [x] Update manifest with DS host_permissions + content_scripts
- [x] Update background.js to broadcast session state to both sites
- [ ] Test YouTube still works after refactor
- [ ] Test DreamingSpanish end-to-end

## Phase 2: Enhanced (future)
- [ ] Dashboard page with charts
- [ ] Data import/export
