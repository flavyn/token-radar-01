// Node 22 standard library only; deterministic input, deterministic output.
import { copyFileSync, mkdirSync, readFileSync, readdirSync, lstatSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0) {
    if (!process.argv[at + 1]) throw Error(`Missing --${name} value`);
    return process.argv[at + 1];
  }
  return process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
}
const here = fileURLToPath(new URL('.', import.meta.url));
const input = arg('input', '/input/snapshot.json');
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
const snapshot = parseSnapshot(readFileSync(input.endsWith('.json') ? input : join(input, 'snapshot.json'), 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue) throw Error(issue);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), JSON.stringify({ rows: board }) + '\n');
writeFileSync(join(out, 'data.js'), dataScript(radar));
function copyDirectory(name: string): number {
  const from = join(here, name), to = join(out, name);
  mkdirSync(to, { recursive: true });
  const names = readdirSync(from).sort();
  for (const file of names) {
    if (file.startsWith('.') || !lstatSync(join(from, file)).isFile()) throw Error(`Unexpected asset: ${name}/${file}`);
    copyFileSync(join(from, file), join(to, file));
  }
  return names.length;
}
const dashboardFiles = copyDirectory('dashboard');
const screenshots = copyDirectory('screenshots');
if (screenshots < 3) throw Error('Three operator screenshots required');
// Required final write: never modify the dossier after the house builder returns its bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, {text_max_bytes: 65536, screenshots:{max:4,max_bytes:524288}, dashboard:{max_files:400,max_bytes:4194304}}));
process.stdout.write(`Token Radar: ${board.length} rows, ${snapshot.watchlist.length} watchlist, ${radar.counts.below_floor} below floor; LOO n=${radar.validation.n}\nWrote board.json, data.js, dashboard/ (${dashboardFiles}), screenshots/ (${screenshots}), dossier.json last.\n`);
