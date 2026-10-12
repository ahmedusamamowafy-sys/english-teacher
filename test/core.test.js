const test = require('node:test');
const assert = require('node:assert/strict');

test('SRS: grading schedules and lapses', async () => {
  const { newCard, review, buildQueue, retention, autoGrade, DAY } = await import('../public/js/srs.js');
  const t0 = 1_000_000_000_000;
  let c = newCard({ front: 'a', back: 'b' }, t0);
  c = review(c, 4, t0);
  assert.equal(c.interval, 1);
  assert.equal(c.due, t0 + DAY);
  c = review(c, 4, t0 + DAY);
  assert.equal(c.interval, 4);
  c = review(c, 5, t0 + 5 * DAY);
  assert.ok(c.interval > 4, 'interval grows');
  const lapsed = review(c, 1, t0 + 20 * DAY);
  assert.equal(lapsed.reps, 0);
  assert.equal(lapsed.lapses, 1);
  assert.ok(lapsed.ease < c.ease && lapsed.ease >= 1.3);
  assert.ok(lapsed.due - (t0 + 20 * DAY) < DAY, 'lapsed card returns the same day');
  // queue: new limit respected, errors first among due
  const cards = [];
  for (let i = 0; i < 20; i++) cards.push(newCard({ front: 'n' + i }, t0));
  assert.equal(buildQueue(cards, { now: t0, newLimit: 5 }).length, 5);
  assert.equal(buildQueue(cards, { now: t0, newLimit: 5, newToday: 5 }).length, 0);
  const dueV = review(newCard({ type: 'vocab' }, t0), 4, t0), dueE = review(newCard({ type: 'error' }, t0), 4, t0);
  const q = buildQueue([dueV, dueE], { now: t0 + 2 * DAY });
  assert.equal(q[0].type, 'error');
  assert.equal(retention([dueV], 14, t0 + DAY), 1);
  assert.equal(autoGrade('Critical Path', 'critical path'), 5);
  assert.equal(autoGrade('critcal path', 'critical path'), 4);
  assert.equal(autoGrade('float', 'critical path'), 1);
  assert.equal(autoGrade('', 'x'), 1);
});

test('Levels: estimation and slow-moving updates', async () => {
  const { estimateFromItems, updateLevel, emptyLevels, toLabel, confidence } = await import('../public/js/levels.js');
  const allRight = [1, 2, 3, 4].map((l) => ({ level: l, correct: true }));
  const lowOnly = [{ level: 1, correct: true }, { level: 1, correct: true }, { level: 2, correct: true }, { level: 3, correct: false }, { level: 4, correct: false }, { level: 5, correct: false }];
  assert.ok(estimateFromItems(allRight) > estimateFromItems(lowOnly));
  assert.ok(estimateFromItems(lowOnly) <= 3);
  assert.equal(estimateFromItems([]), null);
  let L = emptyLevels();
  L = updateLevel(L, 'writing', 3, 3);
  assert.equal(L.writing.est, 3, 'first evidence sets the estimate');
  for (let i = 0; i < 12; i++) L = updateLevel(L, 'writing', 3, 1);
  const before = L.writing.est;
  L = updateLevel(L, 'writing', 6, 1);
  assert.ok(L.writing.est - before < 0.5, 'one outlier moves the estimate only slightly');
  assert.equal(toLabel(2.6), 'B1');
  assert.equal(confidence(0), 'none');
  assert.equal(confidence(20), 'high');
});

test('Offline checker: catches known patterns, leaves correct text alone', async () => {
  const { offlineCheck, textStats } = await import('../public/js/offline.js');
  const bad = offlineCheck("I am agree with the informations. He don't know. We discussed about the delay since 3 months.");
  assert.ok(bad.hasErrors);
  assert.match(bad.corrected, /I agree with the information\./);
  assert.match(bad.corrected, /He doesn't know\./);
  assert.match(bad.corrected, /discussed the delay for 3 months/);
  const good = offlineCheck('We have agreed on the revised programme and will share the information tomorrow.');
  assert.equal(good.hasErrors, false);
  assert.equal(good.corrected, 'We have agreed on the revised programme and will share the information tomorrow.');
  assert.equal(offlineCheck('i think so, and i agree.').corrected, 'I think so, and I agree.');
  assert.equal(offlineCheck('She has two sisters and he has a car.').hasErrors, false);
  assert.equal(offlineCheck('I have to leave.').hasErrors, false);
  const s = textStats('One two three. Four five six seven.');
  assert.equal(s.words, 7);
  assert.equal(s.sentences, 2);
});

test('WAV encoder / downsampler', async () => {
  // speech.js touches window only inside functions, so the pure helpers can be imported.
  global.window = {};
  const { encodeWav, downsample } = await import('../public/js/speech.js');
  const ds = downsample(new Float32Array(48000).fill(0.5), 48000, 16000);
  assert.equal(ds.length, 16000);
  const blob = encodeWav(ds, 16000);
  const buf = Buffer.from(await blob.arrayBuffer());
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buf.toString('ascii', 8, 12), 'WAVE');
  assert.equal(buf.readUInt32LE(24), 16000);
  assert.equal(buf.length, 44 + 16000 * 2);
});

test('JSON parsing of AI replies', async () => {
  global.window = {};
  const { parseJSON } = await import('../public/js/ai.js');
  assert.deepEqual(parseJSON('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJSON('Sure! {"a":{"b":2}} hope that helps'), { a: { b: 2 } });
  assert.throws(() => parseJSON(''));
});
