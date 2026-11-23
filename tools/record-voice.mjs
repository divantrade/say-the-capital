// Records every line the game says as a small audio file (audio/<hash>.m4a), using the Mac's
// built-in voices. Phones play these files reliably; the browser's own voice is not reliable
// on iPhone. Run on a Mac from the project folder:  node tools/record-voice.mjs
// Keep sentenceSplit() and clipName() identical to the copies in index.html.
import { readFileSync, existsSync, mkdirSync, unlinkSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const html = readFileSync('index.html', 'utf8');
const grab = (name) => {
  const m = html.match(new RegExp('var ' + name + ' = ([\\s\\S]*?\\n  [\\]}]);'));
  if (!m) throw new Error('not found: ' + name);
  return Function('return ' + m[1])();
};
const ENTRIES = grab('ENTRIES');
const ENCOURAGEMENT = grab('ENCOURAGEMENT');
const COUNTRY_FACTS = grab('COUNTRY_FACTS');
const ROUND_LENGTH = Number(html.match(/var ROUND_LENGTH = (\d+)/)[1]);

export function sentenceSplit(text) {
  return String(text).split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}
export function clipName(key) {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) { h ^= key.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

// ---- every English sentence the game can say ----
const lines = new Set(["Let's play!", 'Try again!', 'Not quite.', 'Next one!', 'A perfect round!', ROUND_LENGTH + ' of ' + ROUND_LENGTH + '!']);
ENCOURAGEMENT.forEach((c) => lines.add(c));
for (let n = 0; n <= ROUND_LENGTH; n += 1) lines.add('Round over: ' + n + ' of ' + ROUND_LENGTH + ' right.');
for (const e of ENTRIES) {
  const texts = [
    'What is the capital of ' + e.country + '?',
    e.capital + ' is the capital of which country?',
    e.capital + ' is right.', e.country + ' is right.',
    'The capital of ' + e.country + ' is ' + e.capital + '.',
    e.capital + ' is the capital of ' + e.country + '.',
    e.capital + '! The capital of ' + e.country + '.',
  ];
  texts.forEach((t) => sentenceSplit(t).forEach((s) => lines.add(s)));
}

// ---- Mac voices ----
const NOVELTY = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Fred|Junior|Kathy|Ralph|Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley)\b/;
const voices = execFileSync('say', ['-v', '?'], { encoding: 'utf8' }).split('\n').map((l) => {
  const m = l.match(/^(.+?)\s+([a-z]{2,3}_[A-Z0-9]+)\s+#/);
  return m ? { name: m[1].trim(), lang: m[2].replace('_', '-') } : null;
}).filter((v) => v && !NOVELTY.test(v.name));
function voiceFor(lang) {
  const exact = voices.filter((v) => v.lang.toLowerCase() === lang.toLowerCase());
  const base = voices.filter((v) => v.lang.split('-')[0] === lang.split('-')[0]);
  if (!exact.length && lang.startsWith('en')) return null; // other English accents: the main English voice
  return (exact[0] || base[0] || null);
}
const EN = voices.find((v) => v.name === 'Samantha') || voiceFor('en-US');

// ---- record ----
mkdirSync('audio', { recursive: true });
const wanted = new Set();
function record(key, text, voice, rate) {
  const name = clipName(key);
  wanted.add(name + '.m4a');
  const out = join('audio', name + '.m4a');
  if (existsSync(out)) return;
  const aiff = join(tmpdir(), 'stc-' + name + '.aiff');
  execFileSync('say', ['-v', voice.name, '-r', String(rate), '-o', aiff, text]);
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '40000', '-c', '1', aiff, out]);
  unlinkSync(aiff);
}
for (const s of lines) record(s, s, EN, 165);

// Hello words: the local voice says the local word; without a local voice, English says the Latin spelling.
const hello = [];
for (const [city, f] of Object.entries(COUNTRY_FACTS)) {
  const lang = f[4];
  const v = voiceFor(lang);
  const text = (v ? (f[3] || f[2]) : f[2]).replace(/[!¡]/g, '');
  record('hello|' + city, text, v || EN, 140);
  hello.push(city + ': ' + text + ' (' + (v ? v.name : 'English') + ')');
}
wanted.add('test.m4a');
for (const f of readdirSync('audio')) if (!wanted.has(f)) unlinkSync(join('audio', f));
console.log(lines.size + ' lines, ' + hello.length + ' hello words');
console.log(hello.join('\n'));
