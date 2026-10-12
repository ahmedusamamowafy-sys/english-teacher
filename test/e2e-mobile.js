// End-to-end test of the FREE HOSTED setup: static files served from a sub-path (like GitHub Pages),
// no Node API, Gemini called directly from the browser (mocked here), a fake microphone that "speaks",
// phone-sized viewport. Usage: NODE_PATH=<playwright> node test/e2e-mobile.js
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.log('  FAIL', m); } else console.log('  ok  ', m); };
const PUBLIC = path.join(__dirname, '..', 'public');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

// Static server mimicking GitHub Pages at /english-teacher/
function staticServer() {
  return http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (!p.startsWith('/english-teacher/')) { res.writeHead(404, { 'content-type': 'text/html' }); return res.end('<h1>404</h1>'); }
    p = p.slice('/english-teacher'.length); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(PUBLIC, path.normalize(p));
    if (!f.startsWith(PUBLIC) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404, { 'content-type': 'text/html' }); return res.end('<h1>404 Not Found</h1>'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
  });
}

const geminiCalls = [];
function geminiReply(body) {
  const sys = (body.systemInstruction && body.systemInstruction.parts[0].text) || '';
  const last = body.contents[body.contents.length - 1];
  const hasAudio = last.parts.some((p) => p.inlineData);
  if (hasAudio && sys.includes('pronunciation coach')) return { ok: true, feedback: 'Much better, well done.' };
  if (hasAudio) return { heard: 'I am agree that the project is late', command: 'none', errors: [{ category: 'verb tense', wrong: 'I am agree', right: 'I agree', why: 'Agree is a verb, so no am.' }], corrected: 'I agree that the project is late', pronunciation: [{ word: 'project', sound: 'word-stress', heardAs: 'pro-JECT', say: 'PROJ-ect', tip: 'Stress the first part.' }], reply: 'Why do you think it is late?', confidence: 'high', levelEstimate: 3, usedChallenge: false, challenge: null, note: 'Works on a late project' };
  if (sys.includes('Reply with exactly: OK')) return 'OK';
  if (sys.includes('Summarise this practice')) return { summary: 'You discussed delays.', notes: [], nextFocus: 'Linking words.' };
  if (sys.includes('Activity:')) return { reply: 'Interesting! What do you usually eat for breakfast?', errors: [{ category: 'subject-verb agreement', wrong: 'he go', right: 'he goes', why: 'Add -s with he.' }], corrected: '', natural: '', confidence: 'high', levelEstimate: 3, usedChallenge: false, challenge: { expression: 'as far as I know', meaning: 'I think this is true' }, note: '' };
  if (sys.includes('stuck answering')) return { ideas: ['Talk about your favourite food'], phrases: ['I usually...'] };
  return 'OK';
}

(async () => {
  const srv = staticServer(); await new Promise((r) => srv.listen(3130, '127.0.0.1', r));
  const base = 'http://127.0.0.1:3130/english-teacher/';
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-audio-capture=' + path.join(__dirname, 'fake-speech.wav'), '--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, permissions: ['microphone'] });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push(m.text()); });
    await page.addInitScript(() => {
      window.__spoken = [];
      if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { window.__spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 20); };
    });
    await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
      const req = route.request();
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'content-type': 'application/json' };
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      geminiCalls.push({ url: req.url(), key: req.headers()['x-goog-api-key'], body: req.postDataJSON && req.method() === 'POST' ? req.postDataJSON() : null });
      if (req.url().includes('/models?')) return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ models: [{ name: 'models/gemini-3.6-flash', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }] }) });
      const out = geminiReply(req.postDataJSON());
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: typeof out === 'string' ? out : JSON.stringify(out) }] } }] }) });
    });
    const st = () => page.evaluate(() => JSON.parse(localStorage.getItem('englishTeacher.state.v1') || 'null'));

    console.log('Static hosting (sub-path, no server)');
    await page.goto(base);
    await page.waitForSelector('main h1');
    ok((await page.locator('main h1').innerText()).includes('Ahmed'), 'app loads from a sub-path with no backend');
    ok(await page.locator('text=Connect your free AI teacher').count() === 1, 'home invites to set up the free AI');
    for (const r of ['talk', 'voice', 'settings', 'progress', 'vocab', 'grammar', 'exam', 'read', 'listen', 'pron', 'write', 'ask', 'today']) {
      await page.goto(base + '#/' + r); await page.waitForSelector('main h1');
      ok(await page.locator('text=Something went wrong').count() === 0, `route ${r} renders on static hosting`);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    ok(!overflow, 'no horizontal overflow on a phone');

    console.log('Free Gemini setup');
    await page.goto(base + '#/settings');
    await page.fill('input[aria-label="API key"]', 'AIza-test-key');
    await page.click('button:has-text("Save & test")');
    await page.waitForSelector('text=/Connected. Using gemini-3.6-flash/');
    ok(true, 'test connection auto-picks the newest available model');
    ok(geminiCalls.every((c) => c.key === 'AIza-test-key'), 'key sent only in the Gemini header');
    ok(!geminiCalls.some((c) => c.url.includes('AIza')), 'key never placed in the URL');

    console.log('Conversation hub');
    await page.goto(base + '#/talk');
    await page.waitForSelector('.topic');
    ok(await page.locator('.topic').count() >= 50, 'topic grid shows many topics');
    await page.click('button.chip:has-text("Food")');
    ok(await page.locator('.topic').count() === 8, 'category filter works');
    await page.fill('input[aria-label="Search topics"]', 'breakfast');
    await page.fill('input[aria-label="Search topics"]', '');
    await page.click('button.chip:has-text("Debate")');
    await page.click('button.chip:has-text("All") >> nth=0').catch(() => {});
    await page.click('button:has-text("Surprise me")');
    await page.waitForSelector('.msg.ai');
    await page.fill('textarea[aria-label="Your message"]', 'he go to work every day');
    await page.click('button:has-text("Send")');
    await page.waitForSelector('text=What do you usually eat for breakfast?');
    ok(await page.locator('.corr:has-text("he goes")').count() === 1, 'chat shows the correction');
    ok(await page.locator('.challenge:has-text("as far as I know")').count() === 1, 'challenge expression offered');
    const convCall = geminiCalls.filter((c) => c.body && c.body.systemInstruction && c.body.systemInstruction.parts[0].text.includes('Activity:')).length;
    ok(convCall === 1, 'one AI call per chat turn (saves the free quota)');
    await page.click('button:has-text("Hint")');
    await page.waitForSelector('text=I usually...');
    ok(true, 'hint works');
    await page.fill('textarea[aria-label="Your message"]', 'I usually eat eggs and bread');
    await page.click('button:has-text("Send")');
    await page.waitForFunction(() => document.querySelectorAll('.msg.ai').length >= 3);
    await page.click('button:has-text("End & feedback")');
    await page.waitForSelector('text=Conversation feedback');
    await page.waitForSelector('text=You discussed delays.');
    let s = await st();
    ok(s.errors.some((e) => e.right === 'he goes'), 'chat mistake saved to the error database');

    console.log('Hands-free car mode (fake microphone speaks by itself)');
    await page.goto(base + '#/voice');
    await page.selectOption('select[aria-label="accentCoach"]', 'strict');
    await page.click('button:has-text("Start talking")');
    await page.waitForSelector('.orb');
    await page.waitForFunction(() => window.__spoken.some((t) => /Okay Ahmed, let's talk/.test(t)), null, { timeout: 10000 });
    ok(true, 'teacher greets and asks the opening question out loud');
    await page.waitForFunction(() => window.__spoken.some((t) => /Quick tip/.test(t)), null, { timeout: 20000 });
    ok(true, 'after the fake voice stops, the turn is sent without any button press');
    await page.waitForFunction(() => window.__spoken.some((t) => /^Say: project$/.test(t)), null, { timeout: 10000 });
    ok(true, 'strict accent mode asks to repeat the word');
    await page.waitForFunction(() => window.__spoken.some((t) => /Much better/.test(t)), null, { timeout: 20000 });
    ok(true, 'the repeat attempt is checked from audio and the verdict is spoken');
    await page.waitForFunction(() => window.__spoken.some((t) => /Why do you think it is late\?/.test(t)), null, { timeout: 10000 });
    const spoken = await page.evaluate(() => window.__spoken);
    const iTip = spoken.findIndex((t) => /Quick tip/.test(t)), iReply = spoken.findIndex((t) => /Why do you think it is late/.test(t));
    ok(iTip >= 0 && iReply > iTip, 'corrections come before the reply question');
    ok(await page.locator('.heard:has-text("I am agree")').count() === 1, 'screen shows what was heard');
    const audioCall = geminiCalls.find((c) => c.body && c.body.contents.at(-1).parts.some((p) => p.inlineData));
    const b64 = audioCall.body.contents.at(-1).parts.find((p) => p.inlineData).inlineData;
    ok(b64.mimeType === 'audio/wav' && Buffer.from(b64.data, 'base64').toString('ascii', 0, 4) === 'RIFF', 'real WAV audio sent to Gemini');
    const secs = (Buffer.from(b64.data, 'base64').length - 44) / 32000;
    ok(secs > 1.5 && secs < 6, `utterance cut at the pause (${secs.toFixed(1)} s of audio)`);
    await page.waitForFunction(() => /Listening/.test(document.querySelector('.orb-status').textContent), null, { timeout: 10000 });
    ok(true, 'goes back to listening automatically');
    await page.click('button:has-text("End")');
    await page.waitForSelector('text=Session review');
    await page.waitForSelector('text=Sounds to practise');
    ok(await page.locator('.say:has-text("PROJ-ect")').count() >= 1, 'review lists the pronunciation tip');
    s = await st();
    ok(s.pron.some((p) => p.kind === 'ai-audio' && p.issues[0].sound === 'word-stress'), 'sound issue saved for Progress');
    ok(s.convos.some((c) => c.voice), 'hands-free conversation saved');
    ok((s.profile.teacherNotes || []).includes('Works on a late project'), 'teacher remembers a fact from the voice chat');
    await page.goto(base + '#/progress');
    await page.waitForSelector('text=Sounds the teacher heard you struggle with');
    ok(await page.locator('td:has-text("Word stress")').count() === 1, 'Progress shows sound statistics');

    console.log('Second learner (wife) on the same phone');
    await page.goto(base + '#/settings');
    await page.fill('input[aria-label="New learner name"]', 'Mona');
    await page.fill('input[aria-label="About the new learner"]', 'Pharmacist who loves cooking');
    await page.click('button:has-text("Add & switch")');
    await page.waitForSelector('main h1:has-text("Mona")');
    ok(await page.locator('.chip:has-text("Ahmed")').count() === 1, 'switcher shows both learners');
    await page.goto(base + '#/progress');
    await page.waitForSelector('main h1');
    ok(await page.locator('text=I am agree').count() === 0, "Mona does not see Ahmed's mistakes");
    await page.goto(base + '#/voice');
    await page.click('button:has-text("Start talking")');
    await page.waitForFunction(() => window.__spoken.some((t) => /Okay Mona/.test(t)), null, { timeout: 10000 });
    const monaSys = await new Promise((r) => { const t = setInterval(() => { const c = geminiCalls.filter((x) => x.body && x.body.contents.at(-1).parts.some((p) => p.inlineData)).at(-1); if (c && c.body.systemInstruction.parts[0].text.includes('Mona')) { clearInterval(t); r(c.body.systemInstruction.parts[0].text); } }, 200); setTimeout(() => { clearInterval(t); r(''); }, 20000); });
    ok(monaSys.includes('Pharmacist who loves cooking') && !monaSys.includes('planning engineer'), "teacher uses Mona's own background");
    await page.click('button:has-text("End")');
  } finally {
    await browser.close(); srv.close();
  }
  console.log(errors.length ? '\nBrowser errors:\n' + errors.join('\n') : '\nNo browser console errors.');
  if (errors.length) failures++;
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL MOBILE E2E CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('crashed:', e.message); process.exit(2); });
