// Fake OpenAI-compatible chat endpoint for tests. Never contacts the internet.
const http = require('node:http');

function reply(system, userText) {
  if (system.includes('Activity:')) {
    if (userText && userText.includes('XSS')) return JSON.stringify({ reply: '<img src=x onerror="window.__xss=1"> hello <script>window.__xss=2</script>', errors: [], confidence: 'high', levelEstimate: 3 });
    const bad = /He go\b/.test(userText || '');
    return JSON.stringify({ reply: 'Thanks. Why was it delayed?', errors: bad ? [{ category: 'subject-verb agreement', wrong: 'He go', right: 'He goes', why: 'With he/she/it add -s.' }] : [], corrected: bad ? 'He goes to the site every day.' : '', natural: '', confidence: 'high', levelEstimate: 3, usedChallenge: false, challenge: null, note: '' });
  }
  if (system.includes('Task: analyse')) return JSON.stringify({ hasErrors: true, errors: [{ category: 'subject-verb agreement', wrong: 'He go', right: 'He goes', why: 'With he/she/it add -s.' }], corrected: 'He goes to the site.', natural: '', confidence: 'high', levelEstimate: 3, comment: 'Mostly clear.' });
  if (system.includes('Task: review the student')) return JSON.stringify({ corrected: 'We postponed the pour because of wind.', professional: 'We have postponed the concrete pour due to strong winds.', errors: [{ category: 'prepositions', wrong: 'discuss about', right: 'discuss', why: 'No preposition.' }], vocabulary: [{ expression: 'postpone the pour', meaning: 'move the pour to a later date', example: 'We had to postpone the pour.' }], patterns: 'Watch prepositions after verbs.', exercise: { instruction: 'Fix the sentences.', items: [{ prompt: 'We discussed about it.', answer: 'We discussed it.' }, { prompt: 'He go to site.', answer: 'He goes to site.' }, { prompt: 'She explain me.', answer: 'She explains it to me.' }] }, levelEstimate: 3.5, confidence: 'medium' });
  if (system.includes('Summarise this practice')) return JSON.stringify({ summary: 'You described a delay and a recovery plan.', notes: ['Works on the Linear Park project'], nextFocus: 'Practise linking words.' });
  if (system.includes('ORIGINAL reading')) return JSON.stringify({ title: 'Mock text', text: 'This is a mock reading text about scheduling. It has several sentences to read.', glossary: [{ word: 'scheduling', meaning: 'planning times', arabic: 'جدولة' }], questions: [{ q: 'What is the text about?', options: ['Scheduling', 'Cooking', 'Sports', 'Music'], answer: 0 }] });
  if (system.includes('The student asks a question')) return 'Mock answer: use "delay" for lateness and "postpone" for moving a date.';
  if (userText && userText.includes('XSS')) return '<img src=x onerror="window.__xss=1"> hello';
  return 'Thanks. Why was it delayed?';
}

function start(port) {
  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      // --- fake Azure Speech ---
      if (req.url.startsWith('/speech/recognition/')) {
        const cfg = JSON.parse(Buffer.from(req.headers['pronunciation-assessment'] || 'e30=', 'base64').toString());
        requests.push({ url: req.url, azure: 'stt', key: req.headers['ocp-apim-subscription-key'], contentType: req.headers['content-type'], cfg, bytes: raw.length, riff: raw.toString('ascii', 0, 4) });
        res.writeHead(200, { 'content-type': 'application/json' });
        const words = String(cfg.ReferenceText || '').split(/\s+/).filter(Boolean);
        return res.end(JSON.stringify({ RecognitionStatus: 'Success', NBest: [{ Display: cfg.ReferenceText, PronunciationAssessment: { AccuracyScore: 84, FluencyScore: 90, CompletenessScore: 100, PronScore: 87, ProsodyScore: 78 }, Words: words.map((w, i) => ({ Word: w, PronunciationAssessment: { AccuracyScore: i === 1 ? 45 : 92, ErrorType: i === 1 ? 'Mispronunciation' : 'None' }, Phonemes: [{ Phoneme: 'x', PronunciationAssessment: { AccuracyScore: 80 } }] })) }] }));
      }
      if (req.url === '/cognitiveservices/v1') {
        requests.push({ url: req.url, azure: 'tts', key: req.headers['ocp-apim-subscription-key'], ssml: raw.toString() });
        res.writeHead(200, { 'content-type': 'audio/mpeg' }); return res.end(Buffer.from([0xff, 0xfb, 0x90, 0x00]));
      }
      const body = raw.toString();
      let j = {}; try { j = JSON.parse(body); } catch {}
      const system = (j.messages && j.messages[0] && j.messages[0].content) || '';
      const user = (j.messages || []).slice(-1)[0]?.content || '';
      requests.push({ url: req.url, auth: req.headers.authorization, system, user, json: !!j.response_format });
      if (system.includes('FORCE_ERROR')) { res.writeHead(500); return res.end('boom'); }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: reply(system, user) } }] }));
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, requests, port: server.address().port })));
}
module.exports = { start };
if (require.main === module) start(Number(process.argv[2] || 3222)).then((m) => console.log('mock AI on', m.port));
