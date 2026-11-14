# phaser-rewind-patrol

**Rewind Patrol**: a roguelike vertical arcade shooter in Phaser 3. Neon City, 1986: Officer Vega grabs a prototype time drive during a break-in call and gets thrown back through history, on foot (seen from above, feet stepping as he walks). Fight through each timeline, gear up between stages, beat the bosses, recover the missing time-drive parts, and get home.

No build step and no asset files: the pixel art is drawn from text grids in the code and the sounds are synthesized.

- **Play:** https://craigsubnarine.github.io/phaser-rewind-patrol/
- **Repo:** https://github.com/CraigSubnarine/phaser-rewind-patrol
- **Run locally:** open `index.html`, or the `gamedev` preview server at http://localhost:8765/phaser-rewind-patrol/
- **Controls:** phone: drag anywhere (Vega walks towards your finger's movement, so your finger never covers him). Computer: Vega follows the mouse, or use arrow keys / WASD. He fires automatically. Active item: tap the item button (bottom right) or press Space / E when it glows. Pause with the top-right button or Esc / P.

## How a run works

- **30 stages:** 3 timelines (Rome 44 BC, England 1250, the Caribbean 1715) of 10 stages each, on a scrolling top-down road themed to each period. Every stage opens with a card naming the timeline, year and stage; a "time jump" plays between timelines.
  - Stage 5 of each timeline: mid-boss (The Arena Champion, The Siege Engine, The Kraken), drops coffee (full heal) and coins.
  - Stage 10: the timeline's boss (The Iron Centurion, Sir Grimhelm, Captain Blackpowder), drops a time-drive part.
  - Other stages: formations, snaking lines and dive-bombers, getting busier towards each boss (`STAGES`).
- **Health:** 3 HP on Normal (5 on Easy). Donuts heal 1. When HP runs out, the run is over.
- **Coins and the shop:** enemies drop coins. After every stage you visit that timeline's market: 4 cards (up to 2 pieces of that timeline's gear, the rest general gear), plus Reroll and Coffee (+1 HP). Prices rise 50% per copy you own.
- **Upgrades** (`UPGRADES` in `js/data.js`): general gear (fire rate, damage, multi-shot, max HP, speed, coin magnet, crits, a backup partner) and timeline gear only sold in its own timeline (Rome: piercing, shield, full-HP damage; England: longbow, armor, boss damage; Caribbean: cannon, ricochet, more coins).
- **Active items:** charge up as you defeat enemies, then fire with the item button. One at a time (buying another swaps it). Air Support (clear the screen), VCR Remote (skip the stage), Police Siren (freeze enemies), Testudo (invulnerable), Trebuchet Call (huge blast), Broadside (fan of cannonballs).
- **Combos** (`COMBOS`): owning both halves unlocks a bonus, e.g. Pilum + Longbow = Volley Fire, Ship's Cannon + Ricochet = Skipping Shot, Testudo + Scutum = Shield Wall. Shop cards say which combo an item starts or completes.
- **Seeds:** every run has a seed (shown on the story screen, pause menu and end screen; you can type your own). The same seed rolls the same shop offers.
- Menu, story screen, settings (difficulty, sound), pause, game over and win screens. Best score kept per difficulty.

## Code layout

- `index.html`: the page, menus (HTML/CSS) and script tags.
- `js/data.js`: constants, timelines, stage table, difficulty, upgrades, combos, and the pure `computeStats` / `priceOf` helpers.
- `js/art.js`: pixel-art grids, Vega's walk frames, and the road tiles.
- `js/ui.js`: settings, sound, menus, the shop screen, the item button, input.
- `js/game.js`: the Phaser scene (stage flow, shooting, enemies, bosses, items).

## Playtest

`node tools/playtest.js` plays the game headlessly on a phone and a desktop screen: menus, pause, seeds, stage cards, the shop (buy, reroll, heal, combos, same-seed rolls), every active item, all 30 stages and 6 bosses, timeline changes, coffee, winning and game over. It saves screenshots to `playtest-output/` (git-ignored) and fails on any page error. It needs the `playwright-core` package; on this PC it's in the npx cache:

```powershell
$env:NODE_PATH = "$env:LOCALAPPDATA\npm-cache\_npx\e41f203b7505f1fb\node_modules"; node tools/playtest.js
```

## Adding things

- **An upgrade:** add an entry to `UPGRADES` (give it `era` to make it timeline gear, `active` to make it an active item and handle its `effect` in `useActive()`), and maybe a `COMBOS` entry pairing it with something from another timeline.
- **A timeline:** add an entry to `ERAS` (name, year, road, colors, enemy and shot sprites, mid-boss and boss, part name), draw its art in `js/art.js` and its road in `makeRoads`, and give it some timeline gear.

## Lessons

- `this.textures.generate()` turns text grids into pixel-art textures: no image files or editor needed.
- Walk cycle: one top-down body drawing plus a helper that paints the shoes in three positions, played as a 4-frame loop while the road scrolls under Vega.
- Roads are a `tileSprite` whose `tilePositionY` slides every frame; each road is drawn once with Graphics into a 256px tile that repeats seamlessly (seeded random so it looks the same every time).
- Restarting the Phaser scene for a new game wipes every enemy, timer and tween from the last run in one go.
- Upgrades as data: stats are recomputed from scratch (`computeStats`) whenever something is bought, so stacking and combos can't drift out of sync.
- A seeded `RandomDataGenerator` only for the shop keeps runs reproducible without making enemy behaviour deterministic.
- Phaser tweens run on the wall clock while physics and timers run on frame time, so a test that steps frames manually has to feed tweens the same frame time.
- Testing in the Claude browser pane stalls when the pane is hidden (the page pauses itself, as it should). The headless playtest doesn't have that problem.
