// End-to-end smoke test (needs Playwright + Chromium; not part of `npm test`).
// Usage: PORT=3111 node server.js &   then   NODE_PATH=<path to playwright> node test/e2e.js http://localhost:3111
const { chromium } = require('playwright');
const base = process.argv[2] || 'http://localhost:3111';
const errors = [];
let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.log('  FAIL', m); } else console.log('  ok  ', m); };

async function answerAll(page, scope = 'body', max = 40) {
  // Answer exactly the questions of the current MCQ section (read "Question i of M" from the label).
  await page.waitForSelector(`${scope} .mcq .option`);
  const label = await page.locator(`${scope} .mcq .row .muted`).first().innerText();
  const m = Number((label.match(/of (\d+)/) || [])[1] || 1);
  for (let i = 0; i < Math.min(m, max); i++) {
    await page.locator(`${scope} .mcq .option:not([disabled])`).first().click();
    await page.locator(`${scope} .mcq button.btn`).first().click();
  }
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript(() => { // deterministic: no real audio in headless
    window.speechSynthesis && (window.speechSynthesis.speak = (u) => setTimeout(() => u.onend && u.onend(), 5));
  });

  await page.goto(base + '/');
  await page.waitForSelector('h1');
  console.log('Home');
  ok((await page.locator('h1').innerText()).includes('Ahmed'), 'greets by name');
  ok(await page.locator('text=Placement assessment').count() > 0, 'placement call-to-action visible before assessment');

  // every route renders without an error card
  for (const r of ['', 'today', 'talk', 'pron', 'write', 'read', 'listen', 'vocab', 'grammar', 'exam', 'ask', 'progress', 'settings']) {
    await page.goto(`${base}/#/${r}`);
    await page.waitForSelector('main h1');
    const bad = await page.locator('text=Something went wrong').count();
    ok(bad === 0, `route /${r || 'home'} renders`);
  }

  console.log('Placement');
  await page.goto(base + '/#/placement');
  await page.click('button:has-text("Start")');
  await answerAll(page); // grammar
  await page.waitForSelector('h2:has-text("2 · Vocabulary")');
  await answerAll(page); // vocab
  await page.waitForSelector('h2:has-text("3 · Reading")');
  for (let i = 0; i < 3; i++) { await answerAll(page); }
  await page.waitForSelector('h2:has-text("4 · Listening")');
  for (let i = 0; i < 4; i++) { await answerAll(page); }
  await page.waitForSelector('h2:has-text("5 · Writing")');
  await page.fill('textarea', 'Hello Ahmed. We postponed the concrete pour because of the wind. I am agree that Thursday is better. The informations will be sent tomorrow.');
  await page.click('button:has-text("Submit writing")');
  await page.waitForSelector('button:has-text("Continue")');
  ok(await page.locator('.corr').count() >= 2, 'offline writing check found mistakes during placement');
  await page.click('button:has-text("Continue")');
  await page.waitForSelector('h2:has-text("6 · Speaking")');
  await page.click('button:has-text("Skip")');
  await page.waitForSelector('h2:has-text("7 · Pronunciation")');
  await page.click('button:has-text("Continue")');
  await page.waitForSelector('h2:has-text("Your learning profile")');
  ok(await page.locator('.meter').count() === 7, 'profile shows 7 skill meters');
  const prof = await page.locator('main').innerText();
  ok(/Not assessed yet: .*speaking.*pronunciation|Not assessed yet: .*pronunciation/s.test(prof), 'unassessed skills are reported, not guessed');
  const saved = await (await fetch(base + '/api/state')).json();
  await page.waitForTimeout(900);
  const saved2 = await (await fetch(base + '/api/state')).json();
  ok(saved2.state && saved2.state.profile.placementDone === true, 'state persisted to server file');

  console.log('Writing');
  await page.goto(base + '/#/write');
  await page.fill('textarea[aria-label="Your writing"]', 'We discussed about the delay since 3 months. He don\'t know the date.');
  await page.click('button:has-text("Submit for feedback")');
  await page.waitForSelector('.corr');
  ok(await page.locator('.corr').count() >= 3, 'writing: offline corrections shown');

  console.log('Vocabulary');
  await page.goto(base + '/#/vocab');
  await page.click('button:has-text("Turn my mistakes into cards")');
  await page.click('button:has-text("Start review")');
  await page.click('button:has-text("Show answer")');
  await page.click('button:has-text("Good")');
  ok(await page.locator('text=Show answer').count() > 0 || await page.locator('text=Review finished').count() > 0, 'review advances after grading');
  const st = await (async () => { await page.waitForTimeout(900); return (await (await fetch(base + '/api/state')).json()).state; })();
  ok(st.cards.some((c) => c.history && c.history.length), 'a card review was recorded');
  ok(st.cards.some((c) => c.type === 'error'), 'mistakes became error cards');

  console.log('Quick exam');
  await page.goto(base + '/#/exam');
  await page.selectOption('select[aria-label="Questions"]', '5');
  await page.click('button:has-text("Start exam")');
  await answerAll(page, 'main', 8);
  await page.waitForSelector('h2:has-text("Score:")');
  ok(true, 'exam completes with a score');

  console.log('Grammar');
  await page.goto(base + '/#/grammar');
  await page.click('button:has-text("Open") >> nth=0');
  await page.click('button:has-text("Check answers")');
  ok(await page.locator('text=/\\d\\/5/').count() > 0, 'grammar drill scored');

  console.log('Ask (offline)');
  await page.goto(base + '/#/ask');
  await page.fill('textarea', 'present perfect');
  await page.click('button:has-text("Ask")');
  await page.waitForSelector('text=Offline mode');
  ok(await page.locator('text=/Present perfect/i').count() > 0, 'offline search finds the lesson');

  console.log('Talk (offline fallback)');
  await page.goto(base + '/#/talk');
  await page.click('.topic button:has-text("Start") >> nth=0');
  await page.fill('textarea', 'I am agree with the plan.');
  await page.click('button:has-text("Send")');
  await page.waitForSelector('.msg.ai >> nth=1');
  ok(await page.locator('.msg').count() >= 3, 'scripted partner replied');
  await page.click('button:has-text("End & feedback")');
  await page.waitForSelector('text=Conversation feedback');
  ok(true, 'conversation feedback shown');

  console.log('Report and progress');
  await page.goto(base + '/#/today');
  await page.click('button:has-text("Finish session")');
  await page.waitForSelector('h2:has-text("Learning report")');
  ok(await page.locator('text=Recommended next session').count() > 0, 'learning report generated');
  await page.goto(base + '/#/progress');
  await page.waitForSelector('h2:has-text("My error database")');
  ok(await page.locator('table >> text=I agree').count() > 0, 'error database lists logged mistakes');

  console.log('Persistence across reload');
  await page.reload();
  await page.waitForSelector('main h1');
  await page.goto(base + '/#/');
  await page.waitForSelector('h1');
  ok(await page.locator('text=Start today').count() > 0, 'after reload placement is remembered');

  console.log('Mobile layout');
  await page.setViewportSize({ width: 380, height: 760 });
  await page.goto(base + '/#/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  ok(!overflow, 'no horizontal overflow at 380px');

  await browser.close();
  console.log(errors.length ? '\nBrowser errors:\n' + errors.join('\n') : '\nNo browser console errors.');
  if (errors.length) failures++;
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL E2E CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('E2E crashed:', e.message); process.exit(2); });
