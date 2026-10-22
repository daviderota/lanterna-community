/* Checks a community pull request.
   Usage: node check-community-levels.js <changed.txt> <maze.js>
   changed.txt is the output of "git diff --name-status" (status TAB path), run from the PR checkout.
   Rules: only added/changed files matching community/levels/<name>.txt, each one a valid level the game can load.
   Writes a report to the job summary and exits with 1 if something is wrong. */
'use strict';
const fs = require('fs');
const path = require('path');

const [changedFile, mazePath] = process.argv.slice(2);
const Maze = require(path.resolve(mazePath));

const DIR = 'community/levels/';
const NAME_RE = /^community\/levels\/[a-z0-9][a-z0-9-]{1,48}\.txt$/;
const MAX_BYTES = 40 * 1024;     // a 71 x 71 maze is about 6 KB, a 101 x 101 with texts is about 12 KB
const MAX_SIDE = 71;            // the levels of Lanterna are at most 71 x 71
const MAX_TEXT = 400;            // name, story, diary, tip: characters per line

const report = [];
let bad = 0;
const fail = (file, msg) => { bad++; report.push(`- ❌ \`${file}\`: ${msg}`); };
const ok = (file, msg) => report.push(`- ✅ \`${file}\`: ${msg}`);

const changes = fs.readFileSync(changedFile, 'utf8').split('\n').filter(Boolean).map(l => {
  const [status, ...rest] = l.split('\t');
  return { status: status.trim(), file: rest.join('\t').trim() };
});

if (!changes.length) fail('(nessun file)', 'la pull request non aggiunge nessun labirinto.');

for (const { status, file } of changes) {
  if (!file.startsWith(DIR)) { fail(file, `si possono aggiungere file solo nella cartella \`${DIR}\`.`); continue; }
  if (file === DIR + 'README.md') { fail(file, 'il regolamento della cartella lo modifica solo il proprietario del progetto.'); continue; }
  if (status === 'D') { fail(file, 'non si possono cancellare labirinti.'); continue; }
  if (!NAME_RE.test(file)) { fail(file, 'nome del file non valido: usa solo lettere minuscole, numeri e trattini, e finisci con `.txt` (per esempio `la-torre-di-luca.txt`).'); continue; }
  let buf;
  try { buf = fs.readFileSync(file); } catch (e) { fail(file, 'file non leggibile.'); continue; }
  if (buf.length > MAX_BYTES) { fail(file, `file troppo grande (${buf.length} byte, massimo ${MAX_BYTES}).`); continue; }
  const text = buf.toString('utf8');
  if (text.includes('�')) { fail(file, 'il file deve essere testo UTF-8.'); continue; }
  const lv = Maze.parseLevel(text);
  if (lv.errors && lv.errors.length) {
    fail(file, 'il gioco non riesce a caricarlo:\n' + lv.errors.slice(0, 8).map(e => `  - ${e.line ? 'riga ' + e.line + ': ' : ''}${e.msg}`).join('\n'));
    continue;
  }
  if (lv.w > MAX_SIDE || lv.h > MAX_SIDE) { fail(file, `labirinto troppo grande (${lv.w} × ${lv.h}, massimo ${MAX_SIDE} × ${MAX_SIDE}).`); continue; }
  if (!lv.meta || !lv.meta.name) { fail(file, 'manca il nome del labirinto (riga `name:`).'); continue; }
  const header = text.replace(/\r/g, '').split('\n---\n')[0].split('\n');
  const long = header.find(l => l.length > MAX_TEXT + 20);
  if (long) { fail(file, `una riga dell'intestazione è troppo lunga (massimo ${MAX_TEXT} caratteri): "${long.slice(0, 40)}…"`); continue; }
  if (/<[a-z/!]/i.test(header.join('\n'))) { fail(file, 'i testi non possono contenere codice HTML.'); continue; }
  const route = Maze.shortestPath(lv);
  if (!route.length) { fail(file, "non c'è una strada dalla partenza all'uscita."); continue; }
  ok(file, `«${lv.meta.name}», ${lv.w} × ${lv.h}, percorso più breve ${route.length - 1} passi.`);
}

const title = bad ? '## Labirinti della community: da correggere' : '## Labirinti della community: tutto a posto';
const out = [title, '', ...report, ''].join('\n');
console.log(out);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, out + '\n');
process.exit(bad ? 1 : 0);
