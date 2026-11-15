// HONEYHOLD — Defend the Hive, a best-game-01 entry (Node 22, standard library only).
//
// The game itself lives in game/ next to this file: plain static files a desktop
// browser loads offline (game/index.html plus its ES modules, no library, no network
// request). This program is only the hand-in step: it copies game/ and screenshots/
// into the output directory and writes dossier.json there, the summary the judge
// reads, using the vendored make.fun library.
//
// The game: a hex-grid tower defense. Ants, wasps, beetles and spiders march on the
// hive; you place bee-towers on honeycomb hexes to stop them. Four tower types
// (Worker, Soldier, Bomber, Queen's Guard) with Lv2/Lv3 upgrades and selling, a honey
// economy fed by kills and flower tiles, and 10 escalating waves — survive them all
// and the hive stands.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// Directory this file lives in, and the output directory (the grader's /output,
// or MAKEFUN_OUTPUT_DIR when running outside its container).
const rootDir = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function copyTree(source, target) {
  cpSync(join(rootDir, source), join(outDir, target), { recursive: true });
}

mkdirSync(outDir, { recursive: true });
copyTree('game', 'game');

mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(rootDir, 'screenshots'))) {
  copyTree('screenshots', 'screenshots');
}

// The scorer's own caps (reference/gate.json). Only text_max_bytes shapes the
// dossier bytes; the rest refuse an entry the scorer would refuse: more than 4
// screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files in all; or a path under game/ over 1000 bytes.
const dossierCaps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, dossierCaps));
