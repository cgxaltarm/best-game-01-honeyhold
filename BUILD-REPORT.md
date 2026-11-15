# BUILD REPORT — HONEYHOLD: Defend the Hive (best-game-01 challenger)

**Work dir:** `~/workspace/makefun/best-game-01/honeyhold/` — built entirely on the Muse VM
with headless Chrome. Nothing submitted (parent runs jury gate + submit).
**Live entry to beat:** Orbit Rescue (provisional rank 760/810, judge 582854).
**Design answer to Orbit Rescue's low score:** density. The frame fills the whole
1280x720 like the #1 game SUNWRIGHT — top header, left tower panel, right wave
panel, bottom toolbar, honeycomb board between them, almost no empty space.

## The game

Tower defense on a honeycomb hex grid (13x9). Ants, wasps, beetles and spiders
march a winding path to the hive at the right. Four bee towers (Worker 30,
Soldier 60, Bomber 100 splash, Queen's Guard 150 long-range), bought with honey,
click a placed tower to upgrade (Lv2/Lv3) or sell (70% refund). Honey comes from
kills + 8 flower tiles dripping +8 honey / 3s. 10 escalating waves (244 enemies
total, new type introduced per wave), hive HP 20, score + combo for multi-kills,
best score in localStorage. Controls: mouse place/upgrade/sell, 1-4 tower
hotkeys, SPACE start wave / confirm, P/ESC pause, M mute, 1x/2x speed toggle.
Synthesized WebAudio only. Screens: title, gameplay (build + wave), wave-clear
(score breakdown), game over, victory, paused.

## Validation gates — all PASS

| Gate | Result |
|---|---|
| game_files | 9 files in `game/`, 65,928 bytes total (caps: 993 files, 48 MiB); index.html 923 bytes (cap 1 MiB) |
| references | No network: no `http` string, no fetch/XHR/WebSocket, no dynamic import, no bare imports (grep clean); favicon is `data:,`; all imports relative `./src/*.js` |
| screenshots | 4 JPEGs, 1280x720 each, all ≤256 KiB (see below) |
| dossier_matches | `MAKEFUN_OUTPUT_DIR=out node main.ts` run twice: byte-identical dossier.json, 921,611 bytes (cap 1.5 MiB), sha256 `bc956299dfa82baa…` |
| js_parses | All 8 `.js` files in `game/src/` pass `node --check` as ES modules |
| console errors | Zero console/page errors in every headless-Chrome run (gameplay, balance, screenshots) |

## Tests

`tests/play.cjs` (headless Chromium, playwright-core, seed 7) — **21/21 PASS, twice in a row**:
title → PLAY click → hotkey 2 / toolbar card select → place Worker on hex (honey
160→130) → path hex refuses placement → place Soldier → speed toggle 2x → Space
starts wave 1 → wave clears to clear screen (7 kills) → Space to wave 2 build →
select tower → upgrade to Lv2 (honey spent) → P pause / P resume → sell Soldier
(refund, honey rises) → 1 HP + no towers → leak → game over → Space restarts to
wave 1, HP 20/20. Zero console errors.

`tests/balance.cjs` (in-browser auto-player playing the real rules) — **5/5 seeds WIN**:
seed 1: win, score 27,315, HP 20/20, 244 kills; seed 7: 28,220; seed 42: 26,320;
seed 99: 25,110; seed 1,234: 25,895 — all 10 waves, all 244 enemies killed.
Casual-player probe (8 towers, no upgrades, Node): loses at wave 7 on all 3 seeds
tested — so the game is winnable with good play but not trivially easy.

## Screenshots (all real renders from the game's own code, `?shot=` scenes)

| File | Size | Scene |
|---|---|---|
| `screenshots/1-start.jpg` | 161,334 B | Title over a live board (6 towers, enemies on path), PLAY button, full HUD |
| `screenshots/2-play.jpg` | 172,901 B | Wave 3 mid-fight: towers, wasp/ant enemies, HP bars, range circle, upgrade/sell panel |
| `screenshots/3-win.jpg` | 156,336 B | Victory after a genuine auto-played 10-wave win: score 28,790, 244 kills, HP 20/20 |
| `screenshots/4-over.jpg` | 148,994 B | Game over on wave 6: score 1,830, 47 kills, RESTART button |

All four were visually inspected: dense layout, no text overlap, no clipped text.

## Bugs found and fixed

1. `STEP` not imported in `world.js` — `autoPlayToEnd` threw ReferenceError. Fixed import.
2. `FLOWER_RATE`/`FLOWER_EVERY` used in `render.js` but not imported — a page error
   every frame (caught by the gameplay test's error trap). Fixed import.
3. Overlay buttons covered their own prompt line in all 4 screenshots. Rebuilt the
   overlay layout (button drawn inside the panel above the prompt; `overlayButton()`
   exported for hit-testing).
4. Header hearts (20 × 15px) ran into the SOUND ON text. Now 10 hearts (1 heart = 2 HP).
5. Tower descriptions and toolbar lines clipped at card edges. Shortened descriptions.
6. Tower kill counts always showed 0 — kills were never attributed to the firing
   tower. Projectiles now carry their tower; kills increment it.
7. Race: a PLAY click before the first frame found `overlayButton()` null and was
   ignored (one flaky 10-failure run). The title button rect is now initialised at
   module load; play test passes 21/21 twice in a row afterwards.
8. Balance: first auto-play wins were all flawless 20/20 HP, so enemy HP was raised
   ~25% (ant 26→30, wasp 40→46, beetle 85→95, spider 34→38, plus higher per-wave
   scaling). Optimal play still wins all 10 waves; casual play loses at wave 7.

## Repo bits for the parent

- `.makefun/owner.json` present: `{"wallet": "HnRShjG63XWAwiHVxTaT3GRapDce9YmERcjTTi3gu9dX"}`.
- MIT `LICENSE` kept (was already in the work dir).
- No GitHub repo created, nothing pushed, nothing submitted.
- Test scripts kept in `honeyhold/tests/` (`play.cjs`, `balance.cjs`, `shots.cjs`);
  they reuse `~/workspace/makefun/best-game-01/tests/node_modules/playwright-core`
  and serve the game on port 8082 (`node serve.ts --port 8082`).
- `~/workspace/makefun/best-game-01/entry/` (live Orbit Rescue) was not touched.
