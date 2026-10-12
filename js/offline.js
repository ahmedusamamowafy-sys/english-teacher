// Offline rule-based checker. Small and high-precision on purpose: it only flags patterns that are
// almost always wrong, many of them typical for Arabic-speaking learners. It is NOT a replacement for the AI teacher.
const RULES = [
  [/\bI am (agree|disagree)\b/gi, (m, v) => 'I ' + v.toLowerCase(), 'verb tense', "'agree' is a verb, so no 'am': I agree."],
  [/\b(he|she|it) don't\b/gi, (m, s) => s + " doesn't", 'subject-verb agreement', "With he/she/it use 'doesn't'."],
  [/\b(he|she|it) (have)\b(?! to)/gi, (m, s) => s + ' has', 'subject-verb agreement', "With he/she/it use 'has'."],
  [/\b(I|you|we|they) doesn't\b/gi, (m, s) => s + " don't", 'subject-verb agreement', "With I/you/we/they use 'don't'."],
  [/\bdidn't (saw|went|did|took|made|got|gave|came|ate|had|wrote|sent)\b/gi, (m, v) => "didn't " + ({ saw: 'see', went: 'go', did: 'do', took: 'take', made: 'make', got: 'get', gave: 'give', came: 'come', ate: 'eat', had: 'have', wrote: 'write', sent: 'send' })[v.toLowerCase()], 'verb tense', "After 'didn't' use the base form of the verb."],
  [/\binformations\b/gi, () => 'information', 'plurals/countable', "'information' is uncountable: no -s."],
  [/\bequipments\b/gi, () => 'equipment', 'plurals/countable', "'equipment' is uncountable."],
  [/\badvices\b/gi, () => 'advice', 'plurals/countable', "'advice' is uncountable."],
  [/\bfeedbacks\b/gi, () => 'feedback', 'plurals/countable', "'feedback' is uncountable."],
  [/\bfurnitures\b/gi, () => 'furniture', 'plurals/countable', "'furniture' is uncountable."],
  [/\ba (information|equipment|advice|feedback|furniture)\b/gi, (m, w) => w.toLowerCase(), 'articles', "Uncountable nouns don't take 'a'."],
  [/\b(discuss|discussed|discussing) about\b/gi, (m, v) => v, 'prepositions', "'discuss' is followed directly by its object: discuss the schedule."],
  [/\bexplain me\b/gi, () => 'explain to me', 'prepositions', "Say 'explain (something) to me'."],
  [/\bdepend(s|ed)? of\b/gi, (m, s) => 'depend' + (s || '') + ' on', 'prepositions', "We say 'depend on'."],
  [/\binterested of\b/gi, () => 'interested in', 'prepositions', "We say 'interested in'."],
  [/\bgood in (\w+ing|english|planning|math)\b/gi, (m, x) => 'good at ' + x, 'prepositions', "We say 'good at'."],
  [/\bmarried with\b/gi, () => 'married to', 'prepositions', "We say 'married to'."],
  [/\bsince (\d+|one|two|three|four|five|six|seven|eight|nine|ten|a few) (days?|weeks?|months?|years?)\b/gi, (m, n, u) => 'for ' + n + ' ' + u, 'prepositions', "Use 'for' with a length of time, 'since' with a starting point."],
  [/\bmore (better|faster|easier|bigger|cheaper|worse)\b/gi, (m, a) => a, 'word choice', 'Comparative adjectives already express "more".'],
  [/\bin the other hand\b/gi, () => 'on the other hand', 'prepositions', "The fixed phrase is 'on the other hand'."],
  [/\bdespite of\b/gi, () => 'despite', 'prepositions', "Say 'despite' or 'in spite of', not 'despite of'."],
  [/\baccording to me\b/gi, () => 'in my opinion', 'collocation', "'According to' is for other people's views; use 'in my opinion'."],
  [/\bI want that (you|he|she|they|we)\b/gi, (m, p) => 'I want ' + ({ you: 'you', he: 'him', she: 'her', they: 'them', we: 'us' })[p.toLowerCase()] + ' to', 'word order', "Use: want + someone + to + verb."],
  [/\bwaiting (your|the|our|his|her) /gi, (m, d) => 'waiting for ' + d + ' ', 'prepositions', "We say 'wait for'."],
  [/\bcan to (\w+)/gi, (m, v) => 'can ' + v, 'verb tense', "After 'can' use the base verb without 'to'."],
  [/\bI have (\d{2}) years\b/gi, (m, n) => 'I am ' + n + ' years old', 'word choice', "Age uses 'to be': I am 30 years old."],
  [/\b(the )?peoples\b/gi, (m, t) => (t || '') + 'people', 'plurals/countable', "'people' is already plural."],
  [/\bthe people is\b/gi, () => 'the people are', 'subject-verb agreement', "'people' takes a plural verb."],
  [/\bmore than (\d+) (person)\b/gi, (m, n) => 'more than ' + n + ' people', 'plurals/countable', "Plural of 'person' is usually 'people'."],
  [/\bi\b(?=[ ',.])/g, () => 'I', 'spelling', "The pronoun 'I' is always capitalised."],
];

export function offlineCheck(text) {
  const errors = [];
  let corrected = text;
  for (const [re, fix, category, why] of RULES) {
    corrected = corrected.replace(re, (...args) => {
      const m = args[0];
      const right = fix(...args);
      if (right !== m) errors.push({ category, wrong: m, right, why });
      return right;
    });
  }
  // de-duplicate
  const seen = new Set();
  const out = errors.filter((e) => { const k = e.wrong + '>' + e.right; if (seen.has(k)) return false; seen.add(k); return true; });
  return { hasErrors: out.length > 0, errors: out, corrected, natural: '', confidence: 'medium', comment: out.length ? 'Offline rule check (limited). Add an AI key for full feedback.' : 'No known patterns found. This offline check is limited, so this does not prove the text is correct.', offline: true };
}

// Minimal word/sentence stats for writing (offline helpful metrics).
export function textStats(text) {
  const words = (text.match(/[A-Za-z']+/g) || []);
  const sentences = text.split(/[.!?]+\s/).filter((s) => s.trim()).length;
  return { words: words.length, sentences, avgSentence: sentences ? Math.round(words.length / sentences) : 0, uniqueRatio: words.length ? +(new Set(words.map((w) => w.toLowerCase())).size / words.length).toFixed(2) : 0 };
}
