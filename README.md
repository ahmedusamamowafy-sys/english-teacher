# My English Teacher

A personal, local-first English-learning app for an Arabic-speaking construction / project-planning professional. It runs on your own computer, keeps your learning history across restarts, and works in any modern browser (installable as an app on phone or desktop).

- **Works with no keys at all** (Offline mode): placement assessment, quick exams, spaced-repetition cards, grammar drills, reading, dictation/listening, pronunciation practice tools, a limited rule-based writing checker.
- **Add an AI key** to switch on the teacher: natural conversation, speaking and writing correction with explanations, generated reading texts, "Ask your teacher".
- **Add Azure Speech keys** (optional) for measured, phoneme-level pronunciation scores and neural voices.

## Quick start

1. Install Node.js 18 or newer (https://nodejs.org). Check with `node -v`.
2. Open a terminal in this folder and run:
   ```
   node server.js
   ```
3. Open http://localhost:3000 in **Chrome or Edge** (best support for speech recognition).
4. Start with the **placement assessment** on the Home page.

No `npm install` is needed; the app has no dependencies.

### Turning on the AI teacher

Copy `.env.example` to `.env`, fill in one provider, and restart the server:

```
ANTHROPIC_API_KEY=sk-ant-...        # Claude (default model: claude-sonnet-5-5, change with ANTHROPIC_MODEL)
# or an OpenAI-compatible service:
OPENAI_API_KEY=...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

Keys stay in `.env` on the computer running the server. They are never sent to the browser. API usage is billed by the provider you choose; typical daily use (a 10-minute conversation, a few corrections) is small, but check your provider's pricing.

### Turning on pronunciation scoring (optional)

Create an Azure AI Speech resource, then add to `.env`:

```
AZURE_SPEECH_KEY=...
AZURE_SPEECH_REGION=westeurope      # your resource's region
```

With this on, the Speak section can score a recording (accuracy, fluency, completeness, prosody, per-word results) and the app uses Azure neural voices. Scores are labelled **Measured**. Without it, nothing in the app claims to measure your pronunciation: you get listening, recording, waveform comparison, minimal-pair listening quizzes and a browser recognition check, each labelled for what it is.

### Using it on your phone

- On the same Wi-Fi: run with `HOST=0.0.0.0 node server.js`, then open `http://<your-computer-ip>:3000` on the phone. **There is no login**, so only do this on a network you trust.
- Browsers only allow the microphone on `localhost` or HTTPS. For phone use over HTTPS, put the app behind a reverse proxy or a tunnel that adds HTTPS **and authentication** (for example Caddy or Cloudflare Tunnel with access control). Do not expose the app to the internet without authentication: anyone could spend your AI credit.
- "Install app" / "Add to Home screen" in the browser menu makes it open like a normal app.

## New: free phone version, hands-free talking and accent coaching

**Free AI (no server needed).** In Settings → *AI teacher*, paste a free Google Gemini key (from aistudio.google.com/apikey, no credit card). The phone then talks to Gemini directly; the key is stored only on that phone. Gemini also *listens to your voice*, so the teacher can comment on your pronunciation (labelled "AI estimate": it is useful coaching, not a lab measurement).

**Hands-free (🚗).** Press Start once. The app listens, notices when you stop talking, sends your voice, speaks a short tip (grammar and/or pronunciation) and then its reply, and listens again with no buttons. Voice commands: "repeat", "slower", "faster", "new topic", "explain", "stop". Settings on that screen: accent coaching (off / gentle / strict, where strict makes you repeat the word), grammar corrections, how long to wait after you stop talking, and reply length. Set it up before driving; never look at or touch the screen while driving.

**Talk hub.** 141 topics in 14 categories plus the work role-plays, 7 activity types (chat, interview, debate, story builder, quick-fire, explain-it, role-play), "Surprise me", your own topic, hints, Arabic translation of any teacher message, challenge expressions, and turn statistics.

**Several learners.** Settings → *Learners on this device* adds a second person (for example your wife) with separate progress. On separate phones, each phone simply keeps its own learner.

**Hosting for phones.** The `public/` folder is a complete static website. Put it on any free static host with HTTPS (for example GitHub Pages) and open the link on each phone. Learning data lives in each phone's browser, so use Settings → *Download backup* now and then.

Free-tier note: on Gemini's free tier, Google may use what you send to improve its products. Avoid sharing confidential work details in conversations.

## What is in the app

| Section | What it does |
|---|---|
| **Home / Today** | Greeting, level meters, due cards, weekly numbers, and a 10 / 20 / 30 / 45 minute plan that adapts to due cards and your weakest skill. "Finish session" creates the learning report. |
| **Placement** | Grammar, vocabulary, reading, listening, writing, speaking and (if Azure is on) pronunciation. Produces a CEFR estimate per skill, strengths/weaknesses, a weekly schedule and objectives. Unassessed skills stay blank instead of being guessed. |
| **Talk** | Scenario conversations (progress meeting, explaining a delay, extension-of-time negotiation, EVM presentation, interview, small talk, travel, free talk) with Fluency / Balanced / Intensive correction modes, text-to-speech replies, hear-the-correction and repeat-it practice. |
| **Speak** | Sound-pair listening quizzes (P/B, short/long I, A/E, V/F), listen-record-compare with waveform, word stress for project English, consonant clusters, optional Azure scoring. |
| **Write** | Seven writing contexts. Gives corrections with reasons, a professional version, vocabulary/collocations (one-click cards), recurring weaknesses and a practice exercise built from your own mistakes. |
| **Read / Listen** | Graded readings with tap-for-meaning words, comprehension questions, summaries corrected by the teacher, optional Arabic translation; dialogues in several accents at 0.7x to 1.5x, transcript on demand, dictation with word-by-word diff. |
| **Vocabulary** | 49 work-focused expressions and collocations (planning, contracts and claims, site, meetings, email) as spaced-repetition cards with recall prompts; add your own; turn your mistakes into review cards. |
| **Grammar** | 12 short lessons aimed at common Arabic-L1 issues, with typed drills. Lessons matching your logged mistakes are listed first. |
| **Quick exam** | 5 / 10 / 20 questions, optional 10-30 s timer, topic or mixed, near your level. Wrong answers can become review cards. |
| **Ask teacher** | Ask any English question. Offline, it searches the built-in lessons and phrases. |
| **Progress** | Level trends between placements, weekly review, your error database (with improving/active status), pronunciation history, session reports, and what the teacher remembers about you (you can delete items). |
| **Settings** | Correction mode, Arabic support (auto / always / off), voice, speed, accent, daily time, backup/restore/erase. |

## How the teacher learns about you

- Every correction is stored in your **error database** (category, wrong form, right form, count, last seen).
- Later conversations include your most frequent active mistakes in the teacher's instructions so it revisits them naturally.
- A mistake becomes **improving** after three correct uses (detected in your later speech/writing, vocabulary cards, drills) and returns to **active** if it reappears.
- Short durable facts from conversations (for example, a project you work on) are kept as "teacher notes". You can see and remove them in Progress.

## Your data

- Saved to `data/state.json` (previous version kept as `state.json.bak`) and cached in the browser.
- Download or restore a full backup in Settings. Back up before clearing browser data.
- When the AI is on, the text you type or speak (and short context about your level and mistakes) is sent to the AI provider you configured. Audio recordings are only sent to Azure when you press "Score with Azure". Browser speech recognition (Chrome/Edge) sends audio to the browser vendor's speech service.

## Tests

```
npm test                                    # unit/server tests, no browser needed
NODE_PATH=<playwright location> node test/e2e-mobile.js   # phone/static-hosting test with fake mic + mocked Gemini
# browser tests (need Playwright + Chromium):
node server.js &                            # for e2e.js (offline mode)
NODE_PATH=<playwright location> node test/e2e.js http://localhost:3000
NODE_PATH=<playwright location> node test/e2e-ai.js   # starts its own servers and fake AI/Azure
```

Tests cover scheduling, level estimation, the offline checker, content integrity, the server (state, proxy, security checks), and complete browser flows including recording, scoring and a check that AI output is never executed as HTML. They use mock AI and Azure servers; **the app has not been run against the real Claude, OpenAI or Azure services, or on a real microphone/phone, in this build**, so try each once and report anything odd.

## Known limitations (read before relying on it)

- Level estimates are approximate, from short tests. Retake the placement after about 4 weeks. For an official certificate, take a proper exam (IELTS, Cambridge, etc.).
- Speech recognition quality varies by browser, microphone and accent; you can edit the transcript before submitting. Safari and Firefox have limited or no support.
- Without Azure, pronunciation is practised but not scored. Intonation and connected-speech scoring need Azure's prosody output.
- Accents in Listening depend on the voices installed on your device (Azure gives more consistent ones).
- AI corrections can occasionally be wrong or over-strict. The app shows a confidence label and offers corrections as suggestions; check unfamiliar rules against the Grammar lessons or ask the teacher to explain.
- The offline writing checker only recognises about 30 high-confidence patterns.
- Placement and exam item banks are small (about 90 items). Expect repetition after a few weeks; AI-generated reading and the Ask feature extend this.
- The research notes in `docs/research.md` mark which sources I could verify and which findings come from background knowledge; no effect sizes are quoted.

## Project layout

```
server.js            zero-dependency Node server: static files, state persistence, AI + Azure proxy
public/              the PWA (index.html, styles.css, sw.js, manifest)
public/js/           store, srs, levels, plan, offline checker, ai, speech, session, ui
public/js/views/     one file per screen
public/js/content/   original learning content (exams, vocab, readings, listening, grammar, scenarios)
docs/research.md     evidence review and product decisions
test/                unit, server and browser tests (with mock AI/Azure)
```

---

## تشغيل سريع (بالعربي)

1. نزّل Node.js (النسخة 18 أو أحدث) من nodejs.org.
2. افتح الـ terminal جوه فولدر البرنامج واكتب: `node server.js`
3. افتح المتصفح (Chrome أو Edge) على العنوان: http://localhost:3000
4. ابدأ بـ "Placement assessment" من الصفحة الرئيسية علشان يحدد مستواك.
5. علشان المدرس الذكي يشتغل: انسخ `.env.example` باسم `.env` وحط مفتاح الـ AI، وبعدين اقفل السيرفر وشغّله تاني.

من غير مفتاح، التمارين والامتحانات السريعة والكروت والقواعد والقراءة والاستماع بتشتغل عادي.
