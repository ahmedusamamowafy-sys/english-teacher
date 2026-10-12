import { h, clear, card, btn, note, badge, toast } from '../ui.js';
import { state, save, exportJSON, importJSON, resetAll, pushRemote, getProfiles, addProfile, switchProfile, renameProfileEntry, removeProfile, currentProfileId, isRemote } from '../store.js';
import { config, getDeviceAI, setDeviceAI, testConnection } from '../ai.js';
import { listVoices, speak } from '../speech.js';

export function render(root) {
  const s = state.profile.settings;
  const p = state.profile;
  root.append(h('h1', {}, 'Settings'));

  const field = (label, el) => h('div', {}, h('label', {}, label), el);
  const sel = (key, opts, parse = (x) => x) => h('select', { onchange: (e) => { s[key] = parse(e.target.value); save(); toast('Saved'); } }, opts.map(([v, t]) => h('option', { value: v, selected: String(s[key]) === String(v) }, t)));
  const name = h('input', { value: p.name, onchange: (e) => { p.name = e.target.value.trim() || 'Student'; renameProfileEntry(currentProfileId(), p.name); save(); toast('Saved'); }, 'aria-label': 'Name' });
  const about = h('textarea', { rows: 3, value: p.about || '', placeholder: 'e.g. I am a teacher from Cairo living in Riyadh. I love cooking and travel.', onchange: (e) => { p.about = e.target.value.trim(); save(); toast('Saved'); }, 'aria-label': 'About me' });
  const voices = listVoices();
  const voiceSel = h('select', { onchange: (e) => { s.voiceName = e.target.value; save(); } }, [h('option', { value: '' }, 'Automatic'), ...voices.map((v) => h('option', { value: v.name, selected: s.voiceName === v.name }, `${v.name} (${v.lang})`))]);
  // voices load asynchronously in some browsers
  if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => { const vs = listVoices(); clear(voiceSel); voiceSel.append(h('option', { value: '' }, 'Automatic'), ...vs.map((v) => h('option', { value: v.name, selected: s.voiceName === v.name }, `${v.name} (${v.lang})`))); };

  root.append(card(h('h2', { style: { marginTop: 0 } }, 'Learning'),
    field('Your name', name),
    field('About me (the teacher uses this to choose topics and examples)', about),
    field('Correction mode', sel('correctionMode', [['fluency', 'Fluency: feedback after you finish'], ['balanced', 'Balanced: important mistakes only'], ['intensive', 'Intensive: most mistakes, detailed']])),
    field('Arabic support', sel('arabicSupport', [['auto', 'Auto: only when helpful'], ['always', 'Always show brief Arabic notes'], ['off', 'Off: English only']])),
    field('Daily time', sel('dailyMinutes', [[10, '10 minutes'], [20, '20 minutes'], [30, '30 minutes'], [45, '45 minutes']], Number)),
    field('New cards per day', sel('newCardsPerDay', [[3, '3'], [5, '5'], [8, '8'], [12, '12'], [20, '20']], Number))));

  root.append(card(h('h2', { style: { marginTop: 0 } }, 'Voice'),
    field('Accent for speech recognition and default voice', sel('accent', [['en-US', 'American'], ['en-GB', 'British'], ['en-AU', 'Australian'], ['en-IN', 'Indian']])),
    field('Voice', voiceSel),
    field('Speaking speed', sel('ttsRate', [[0.7, 'Slow'], [0.85, 'Slightly slow'], [1, 'Normal'], [1.15, 'Slightly fast']], Number)),
    btn('🔊 Test voice', () => speak('Good morning. Let us review the schedule.'), 'small')));

  root.append(aiCard());
  root.append(learnersCard());

  const file = h('input', { type: 'file', accept: 'application/json', hidden: true, onchange: async (e) => { const f = e.target.files[0]; if (!f) return; try { importJSON(await f.text()); toast('Backup restored.'); location.reload(); } catch (err) { toast('Import failed: ' + err.message); } } });
  root.append(card(h('h2', { style: { marginTop: 0 } }, 'Your data'),
    h('p', { class: 'small muted' }, 'Your student profile, error database, cards and reports are saved to data/state.json on the server computer, and cached in this browser. Make a backup before clearing browser data.'),
    h('div', { class: 'row' }, btn('Download backup', () => { const a = h('a', { href: URL.createObjectURL(new Blob([exportJSON()], { type: 'application/json' })), download: `english-teacher-backup-${new Date().toISOString().slice(0, 10)}.json` }); document.body.append(a); a.click(); a.remove(); }), btn('Restore backup…', () => file.click()), btn('Save to server now', async () => toast((await pushRemote()) ? 'Saved to server.' : 'Server not reachable.')), file),
    h('h3', {}, 'Danger zone'), btn('Erase all my data', () => { if (prompt('This deletes all progress. Type DELETE to confirm.') === 'DELETE') { resetAll(); toast('All data erased.'); location.hash = '#/'; location.reload(); } }, 'danger')));
}

function aiCard() {
  const d = getDeviceAI();
  const provider = h('select', { 'aria-label': 'AI provider' }, [['gemini', 'Google Gemini (free, recommended, listens to your accent)'], ['openai', 'OpenAI-compatible (e.g. Groq free, text only)']].map(([v, t]) => h('option', { value: v, selected: d.provider === (v === 'openai' ? 'openai' : 'gemini') || (v === 'openai' && d.provider !== 'gemini') }, t)));
  const key = h('input', { type: 'password', value: d.key || '', placeholder: 'Paste your API key here', autocomplete: 'off', spellcheck: false, 'aria-label': 'API key' });
  const baseUrl = h('input', { value: d.baseUrl || 'https://api.groq.com/openai/v1', 'aria-label': 'Base URL' });
  const model = h('input', { value: d.model || '', placeholder: 'Automatic', 'aria-label': 'Model' });
  const extra = h('div', {}, h('label', {}, 'Base URL'), baseUrl, h('label', {}, 'Model'), model);
  const out = h('div', {});
  const sync = () => { extra.hidden = provider.value === 'gemini'; };
  provider.addEventListener('change', sync); sync();
  const status = config.device ? h('span', { class: 'badge ok' }, '✔ Connected: ' + (d.model || d.provider)) : config.serverAI ? h('span', { class: 'badge ok' }, '✔ Using the computer\'s key') : h('span', { class: 'badge warn' }, 'Not connected');
  const guide = h('details', {}, h('summary', {}, 'How to get a free Gemini key (2 minutes)'),
    h('ol', {},
      h('li', {}, 'On this phone or computer, open aistudio.google.com/apikey and sign in with your Google account.'),
      h('li', {}, 'Tap "Create API key" (accept the terms if asked). No credit card is needed for the free tier.'),
      h('li', {}, 'Copy the key, paste it in the box above, and tap "Save & test".')),
    h('p', { class: 'small muted' }, 'Free-tier limits: roughly 10 requests per minute and over 1,000 per day, which is plenty for daily practice. On the free tier Google may use what you send to improve its products, so don\'t share private or confidential work details in conversations.'),
    h('p', { class: 'small muted' }, 'Each person can use their own key, or the same key on both phones (the free limit is then shared).'));
  const test = btn('Save & test', async () => {
    test.disabled = true; clear(out); out.append(h('p', { class: 'muted' }, 'Testing…'));
    const v = { provider: provider.value === 'gemini' ? 'gemini' : 'openai', key: key.value.trim(), baseUrl: provider.value === 'gemini' ? '' : baseUrl.value.trim(), model: provider.value === 'gemini' ? '' : model.value.trim() };
    const r = await testConnection(v);
    clear(out);
    out.append(h('p', { class: r.ok ? 'good' : 'bad' }, (r.ok ? '✔ ' : '✘ ') + r.message));
    if (r.ok) toast('AI connected. The teacher is ready.');
    test.disabled = false;
  }, 'primary');
  const remove = btn('Remove key', () => { setDeviceAI({ provider: 'gemini', key: '', model: '', baseUrl: '' }); key.value = ''; toast('Key removed from this device.'); }, 'small danger');
  return card(h('div', { class: 'row between' }, h('h2', { style: { margin: 0 } }, 'AI teacher'), status),
    h('p', { class: 'small muted' }, 'The key is saved only in this browser on this device. It is sent only to the AI provider, never to anyone else.'),
    h('label', {}, 'Provider'), provider, h('label', {}, 'API key'), key, extra,
    h('div', { class: 'row', style: { marginTop: '10px' } }, test, d.key ? remove : null), out, guide);
}

function learnersCard() {
  const profs = getProfiles();
  const list = h('div', {});
  for (const pr of profs.list) {
    const isCur = pr.id === profs.current;
    list.append(h('div', { class: 'row between', style: { margin: '6px 0' } }, h('span', {}, '👤 ' + pr.name, isCur ? h('span', { class: 'badge ok', style: { marginLeft: '8px' } }, 'current') : null),
      h('div', { class: 'row' }, !isCur ? btn('Switch to', () => { switchProfile(pr.id); location.hash = '#/'; location.reload(); }, 'small primary') : null,
        !isCur ? btn('Delete', () => { if (prompt(`Delete ${pr.name}'s progress on this device? Type DELETE to confirm.`) === 'DELETE') { removeProfile(pr.id); location.reload(); } }, 'small danger') : null)));
  }
  const nm = h('input', { placeholder: 'Name, e.g. your wife\'s name', 'aria-label': 'New learner name' });
  const ab = h('input', { placeholder: 'About them (job, interests): helps the teacher', 'aria-label': 'About the new learner' });
  return card(h('h2', { style: { marginTop: 0 } }, 'Learners on this device'),
    h('p', { class: 'small muted' }, 'Each learner has their own level, mistakes, cards and conversations. If each person uses their own phone, you don\'t need this: each phone keeps its own learner.'),
    list, h('label', {}, 'Add a learner'), nm, ab,
    btn('Add & switch', () => { if (!nm.value.trim()) { toast('Enter a name.'); return; } const id = addProfile(nm.value.trim(), ab.value.trim()); switchProfile(id); location.hash = '#/'; location.reload(); }, 'primary', { style: { marginTop: '8px' } }));
}
