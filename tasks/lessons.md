# YT Rewind Logger - Lessons Learned

## 1. JSON extraction from YouTube HTML needs brace matching
**Problem**: Using `html.indexOf(';</script>')` to find the end of `ytInitialPlayerResponse` fails because YouTube puts multiple `var` assignments in the same `<script>` block. The naive approach grabs extra JS code after the JSON, causing `JSON.parse()` to throw.
**Fix**: Use a brace-matching parser that counts `{`/`}` depth while respecting quoted strings and escape characters. This reliably finds the exact end of the JSON object regardless of surrounding code.
**Rule**: Never use `;</script>` or similar delimiters to extract JSON from HTML. Always use structural parsing (brace matching) for embedded JSON.

## 2. Use MAIN world scripts to read page JS variables, not HTML parsing
**Problem**: Fetching the YouTube page HTML and parsing `ytInitialPlayerResponse` is fragile — the HTML structure changes, the JSON extraction can fail, and the timedtext `baseUrl` may have an existing `fmt` parameter that's not `json3`, causing `response.json()` to fail on non-JSON responses.
**Fix**: Use a `"world": "MAIN"` content script that reads `window.ytInitialPlayerResponse` directly from the page's JS context and communicates caption tracks to the isolated world content script via `window.postMessage`. Keep HTML fetch as fallback only.
**Rule**: When a Chrome extension needs data from a page's JavaScript context, prefer MAIN world content scripts over HTML scraping. It's more reliable across site updates.

## 3. Always force the expected format on YouTube API URLs
**Problem**: YouTube's `baseUrl` for caption tracks may already contain an `fmt` parameter set to a non-JSON format (e.g., `fmt=srv3`). Checking `!url.includes('fmt=')` misses this, and the response is XML/empty instead of JSON.
**Fix**: Use `URL.searchParams.set('fmt', 'json3')` to always override/set the format. Also read the response as `.text()` first and parse manually for better error messages.

## 4. Use same-name-class adapter pattern for multi-site Chrome extensions
**Problem**: Supporting multiple sites (YouTube, DreamingSpanish) requires site-specific logic for rewind detection, transcript extraction, and metadata — but the orchestration layer should be shared.
**Fix**: Each site provides classes with the same name (`SiteAdapter`, `TranscriptManager`, `RewindDetector`) and same interface. Manifest `content_scripts` entries control which scripts load per site. Only one site's scripts load per page, so there are no naming conflicts. The shared `content.js` orchestrator calls `new SiteAdapter()` etc. without knowing which site provided the class.
**Rule**: When extending a Chrome extension to multiple sites, use the same-name-class adapter pattern with per-site manifest entries rather than if/else branching in the orchestrator.
