const test = require('node:test');
const assert = require('node:assert/strict');

function checkMcq(item, where) {
  assert.ok(Array.isArray(item.options) && item.options.length >= 3, where + ': options');
  assert.ok(Number.isInteger(item.answer) && item.answer >= 0 && item.answer < item.options.length, where + ': answer index');
  assert.equal(new Set(item.options.map((o) => o.toLowerCase())).size, item.options.length, where + ': duplicate options');
  assert.ok((item.q || '').length > 3, where + ': question text');
}

test('Exam bank and placement items are well-formed', async () => {
  global.window = {};
  const E = await import('../public/js/content/exams.js');
  assert.ok(E.BANK.length >= 50, 'bank size ' + E.BANK.length);
  for (const [i, it] of E.BANK.entries()) { checkMcq(it, 'BANK[' + i + ']'); assert.ok(E.CATEGORIES[it.cat], 'unknown category ' + it.cat); assert.ok(it.level >= 1 && it.level <= 6); }
  const levels = new Set(E.BANK.map((b) => b.level));
  for (const l of [1, 2, 3, 4, 5]) assert.ok(levels.has(l), 'bank covers level ' + l);
  for (const r of E.PLACEMENT_READING) r.questions.forEach((q, i) => checkMcq(q, r.title + ' q' + i));
  E.PLACEMENT_LISTENING.forEach((l, i) => checkMcq(l.q, 'listening' + i));
  E.PLACEMENT_VOCAB.forEach((v, i) => checkMcq(v, 'pvocab' + i));
});

test('Reading, listening, vocab and grammar content are consistent', async () => {
  const M = await import('../public/js/content/media.js');
  const V = await import('../public/js/content/vocab.js');
  const G = await import('../public/js/content/grammar.js');
  const S = await import('../public/js/content/scenarios.js');
  for (const r of M.READINGS) { r.questions.forEach((q, i) => checkMcq(q, r.id + ' q' + i)); assert.ok(r.text.split(/\s+/).length > 60, r.id + ' text length'); }
  for (const d of M.DIALOGUES) { d.questions.forEach((q, i) => checkMcq(q, d.id + ' q' + i)); assert.ok(d.lines.length >= 4); }
  const seen = new Set();
  for (const v of V.VOCAB) {
    assert.ok(!seen.has(v.expr), 'duplicate vocab ' + v.expr); seen.add(v.expr);
    assert.ok(v.cloze.includes('___'), v.expr + ': cloze needs a blank');
    assert.ok(v.ex.length >= 1 && v.meaning);
  }
  assert.ok(V.VOCAB.length >= 45);
  for (const g of G.GRAMMAR) {
    assert.ok(g.drills.length >= 5, g.id);
    for (const d of g.drills) { assert.ok(d.a.length, g.id); for (const a of d.a) assert.equal(a, a.toLowerCase(), g.id + ' answers must be lowercase: ' + a); }
  }
  assert.ok(S.SCENARIOS.length >= 8 && S.WRITING_CONTEXTS.length >= 6);
});
