// E2E for the AI-enabled paths, using a local mock of an OpenAI-compatible API (no internet, no real key).
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const os = require('node:os'), fs = require('node:fs'), path = require('node:path');
const mock = require('./mock-ai.js');
let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.log('  FAIL', m); } else console.log('  ok  ', m); };

(async () => {
  const m = await mock.start(0);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'et-e2e-'));
  const PORT = 3113, base = 'http://127.0.0.1:' + PORT;
  const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT, DATA_DIR: tmp, AI_PROVIDER: 'openai', OPENAI_API_KEY: 'test', OPENAI_BASE_URL: `http://127.0.0.1:${m.port}/v1`, AZURE_SPEECH_KEY: 'azkey', AZURE_SPEECH_REGION: 'test', AZURE_TEST_BASE: `http://127.0.0.1:${m.port}` }, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 900));
  const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const errors = [];
  try {
    const page = await (await browser.newContext({ viewport: { width: 1100, height: 900 }, permissions: ['microphone'] })).newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (x) => { if (x.type() === 'error') errors.push(x.text()); });
    await page.addInitScript(() => { window.speechSynthesis && (window.speechSynthesis.speak = (u) => setTimeout(() => u.onend && u.onend(), 5)); });
    const state = async () => { await page.waitForTimeout(900); return (await (await fetch(base + '/api/state')).json()).state; };

    console.log('Talk with AI');
    await page.goto(base + '/#/talk');
    await page.click('.topic button:has-text("Start") >> nth=0');
    await page.fill('textarea', 'He go to the site every day.');
    await page.click('button:has-text("Send")');
    await page.waitForSelector('text=Feedback on your last answer');
    ok(await page.locator('.msg.ai', { hasText: 'Why was it delayed' }).count() === 1, 'AI partner reply shown');
    ok(await page.locator('.corr:has-text("He goes")').count() >= 1, 'balanced mode shows the correction inline');
    let s = await state();
    ok(s.errors.length === 1 && s.errors[0].category === 'subject-verb agreement', 'mistake logged in error database');
    await page.fill('textarea', 'The crane arrives at noon.');
    await page.click('button:has-text("Send")');
    await page.waitForFunction(() => document.querySelectorAll('.msg.ai').length >= 3);
    const sys = m.requests.filter((r) => (r.system || '').includes('Activity:')).at(-1).system;
    ok(sys.includes('"He go" -> "He goes"'), 'teacher prompt includes the recurring mistake to revisit');
    ok(sys.includes('Egyptian Arabic speaker') && sys.includes('Current estimated levels'), 'teacher prompt carries student context');
    await page.click('button:has-text("End & feedback")');
    await page.waitForSelector('text=You described a delay');
    s = await state();
    ok((s.profile.teacherNotes || []).some((n) => n.includes('Linear Park')), 'teacher remembers a durable fact');
    ok(s.convos.length === 1, 'conversation saved');

    console.log('Writing with AI');
    await page.goto(base + '/#/write');
    await page.fill('textarea[aria-label="Your writing"]', 'We discuss about the pour. It postponed because wind.');
    await page.click('button:has-text("Submit for feedback")');
    await page.waitForSelector('text=Natural, professional version');
    ok(await page.locator('text=We have postponed the concrete pour').count() > 0, 'professional version shown');
    await page.click('button:has-text("+ Card")');
    await page.waitForSelector('text=Practice from your own mistakes');
    await page.fill('input[aria-label="Your answer"] >> nth=0', 'We discussed it.');
    await page.click('button:has-text("Check")');
    ok(await page.locator('.good:has-text("✔")').count() >= 1, 'exercise auto-checked');
    s = await state();
    ok(s.cards.some((c) => c.id === 'w:postpone the pour'), 'vocabulary suggestion became a card');
    ok(s.errors.some((e) => e.right === 'discuss'), 'writing mistakes added to the error database');
    ok(s.profile.levels.writing.n > 0, 'writing level estimate updated from AI');

    console.log('Reading, Ask');
    await page.goto(base + '/#/read');
    await page.fill('input[aria-label="Topic"]', 'schedules');
    await page.click('button:has-text("Generate a new text")');
    await page.waitForSelector('h2:has-text("Mock text")');
    ok(true, 'AI-generated reading opens');
    await page.goto(base + '/#/ask');
    await page.fill('textarea', 'delay vs postpone');
    await page.click('button:has-text("Ask")');
    await page.waitForSelector('text=Mock answer');
    ok(true, 'teacher answer displayed');

    console.log('Pronunciation with (mock) Azure');
    await page.goto(base + '/#/pron');
    await page.click('button[role="tab"]:has-text("Listen")');
    await page.click('button:text-is("🎙️ Record")');
    await page.waitForTimeout(1200);
    await page.click('button:has-text("Stop")');
    await page.waitForSelector('text=Self-comparison');
    ok(await page.locator('audio:not([hidden])').count() === 1, 'recording is available for playback');
    const hasWave = await page.evaluate(() => { const c = document.querySelector('canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true; return false; });
    ok(hasWave, 'waveform drawn from the recording');
    await page.click('button:has-text("Score with Azure")');
    await page.waitForSelector('text=Measured (Azure)');
    ok(await page.locator('td:has-text("Mispronunciation")').count() === 1, 'word-level result shown');
    const az = m.requests.filter((r) => r.azure === 'stt').at(-1);
    ok(az && az.riff === 'RIFF' && /samplerate=16000/.test(az.contentType) && az.key === 'azkey', 'proxy sent 16 kHz WAV with the key (key stays server-side)');
    ok(az && az.cfg.ReferenceText.length > 10 && az.cfg.Granularity === 'Phoneme', 'assessment configured with reference text and phoneme granularity');
    s = await state();
    ok(s.pron.some((p) => p.kind === 'azure' && p.accuracy === 84), 'measured scores saved');
    ok(s.profile.levels.pronunciation.n > 0, 'pronunciation level only set after a measured score');
    const keyInBrowser = await page.evaluate(() => JSON.stringify(localStorage) + document.documentElement.outerHTML);
    ok(!keyInBrowser.includes('azkey') && !keyInBrowser.includes('test-key'), 'API keys never reach the browser');
    await page.goto(base + '/#/vocab');
    await page.click('button:has-text("Start review")');
    await page.locator('button:has-text("Show answer")').click();
    await page.locator('button:has-text("🔊")').first().click();
    await page.waitForTimeout(400);
    ok(m.requests.some((r) => r.azure === 'tts' && r.ssml.includes('<voice name="en-US-JennyNeural">')), 'Azure TTS used for listening when configured');

    console.log('Security: AI output is rendered as text, never HTML');
    await page.goto(base + '/#/talk');
    await page.click('.topic button:has-text("Start") >> nth=0');
    await page.fill('textarea', 'XSS test please');
    await page.click('button:has-text("Send")');
    await page.waitForFunction(() => document.querySelectorAll('.msg.ai').length >= 2);
    ok(await page.evaluate(() => window.__xss === undefined) && await page.locator('main img').count() === 0, 'HTML in AI replies is not executed');
  } finally {
    await browser.close(); srv.kill(); m.server.close(); fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(errors.length ? '\nBrowser errors:\n' + errors.join('\n') : '\nNo browser console errors.');
  if (errors.length) failures++;
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL AI E2E CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('crashed:', e.message); process.exit(2); });
