# Architecture notes

- **No build step, no dependencies.** The server is plain Node; the client is ES modules served as static files.
- **Rendering.** `ui.h()` builds DOM nodes with `textContent`, so AI or user text can never inject HTML (tested).
- **State.** One JSON document (`store.js`). Server file is the source of truth; localStorage is a cache; newest `updatedAt` wins at load. Writes are debounced (600 ms) and atomic (temp file + rename, previous version kept as `.bak`).
- **Levels.** Each skill holds `{est, n}` on a numeric CEFR scale (A1=1 .. C2=6). Updates are evidence-weighted running averages with a cap on the prior weight, so one result moves a mature estimate only slightly. Placement uses a small logistic model over item difficulty.
- **SRS.** SM-2 variant, four grades, lapsed cards return in 10 minutes, daily new-card cap, mistake cards are prioritised among due items.
- **AI layer.** `server.js` proxies `/api/ai` to Anthropic or an OpenAI-compatible endpoint. The browser sends only `{system, messages, json, maxTokens}`. `ai.js` builds the teacher prompt from the profile, levels, recurring errors and teacher notes, and parses structured JSON replies defensively.
- **Speech.** Browser SpeechSynthesis / SpeechRecognition by default; Azure TTS and pronunciation assessment (REST short-audio) through the proxy when keys exist. Recording is converted to 16 kHz mono PCM WAV in the browser.
- **Security.** Server binds to 127.0.0.1 by default; API routes reject cross-origin browser requests; static serving blocks path traversal; request bodies are size-limited; error messages never include keys.
- **Offline.** `sw.js` caches the app shell (network first, cache fallback); API calls are never cached.
