# phaser-rewind-patrol

**Rewind Patrol**: a vertical arcade shooter in Phaser 3. Neon City, 1986: Officer Vega grabs a prototype time drive during a break-in call and gets thrown back through history, on foot (seen from above, feet stepping as Vega walks). Fight each era's army, beat its boss, recover the three missing time-drive parts, and get home.

One `index.html`, no build step, no asset files: the pixel art is drawn from text grids in the code and the sounds are synthesized.

- **Play:** https://craigsubnarine.github.io/phaser-rewind-patrol/
- **Repo:** https://github.com/CraigSubnarine/phaser-rewind-patrol
- **Run locally:** open `index.html`, or the `gamedev` preview server at http://localhost:8765/phaser-rewind-patrol/
- **Controls:** phone: drag anywhere (Vega moves with your finger, so your finger never covers the character). Computer: Vega follows the mouse, or use arrow keys / WASD. Vega fires automatically. Pause with the button in the top-right corner or Esc / P.
- **Status:** v1 playable on phones and desktop. 30 stages: 3 timelines (Rome 44 BC, England 1250, the Caribbean 1715) of 10 stages each. Vega walks a scrolling top-down road themed to each period (Roman paving stones, a muddy cart track, a wooden pier; a 1986 street on the menu). Every stage opens with a card naming the timeline, year and stage; a "time jump" plays between timelines.
  - Stage 5 of each timeline: mid-boss (The Arena Champion, The Siege Engine, The Kraken), drops coffee (extra life) and a gun badge.
  - Stage 10: the timeline's boss (The Iron Centurion, Sir Grimhelm, Captain Blackpowder), drops one of the three time-drive parts.
  - Other stages: formations, snaking lines and dive-bombers, getting busier towards each boss (table in `STAGES`).
  - Gold badges upgrade the gun (5 levels; you lose one level when hit), donuts are bonus points. Menu, story screen, settings (difficulty, sound), pause, game over and win screens. Best score kept per difficulty.

## Playtest

`node tools/playtest.js` plays the game headlessly on a phone and a desktop screen (menus, pause, stage cards, all 30 stages and 6 bosses, timeline changes, coffee extra life, winning, game over), saves screenshots to `playtest-output/` (git-ignored) and fails on any page error. It needs the `playwright-core` package; on this PC it's in the npx cache:

```powershell
$env:NODE_PATH = "$env:LOCALAPPDATA\npm-cache\_npx\e41f203b7505f1fb\node_modules"; node tools/playtest.js
```

## Adding an era

Add an entry to `ERAS` (name, year, road, colors, enemy and shot sprites, mid-boss and boss, part name), draw its enemy, shots and bosses in `ART`, and add its road in `makeRoads`. Nothing else changes: stage numbers, the HUD and the ending all follow `ERAS.length`. Ideas: Wild West outlaws on a dusty trail, feudal Japan on a temple path, prehistoric cavemen.

## Lessons

- `this.textures.generate()` turns text grids into pixel-art textures: no image files or editor needed.
- Walk cycle: one top-down body drawing plus a helper that paints the shoes in three positions (together, left forward, right forward), played as a 4-frame loop. The road scrolls under Vega the whole time, so he's always walking.
- Roads are a `tileSprite` whose `tilePositionY` slides every frame; each road is drawn once with Graphics into a 256px tile that repeats seamlessly (seeded random so it looks the same every time).
- Restarting the Phaser scene for a new game wipes every enemy, timer and tween from the last run in one go; much safer than resetting things by hand.
- Phaser tweens run on the wall clock while physics and timers run on frame time, so a test that steps frames manually has to feed tweens the same frame time.
- Testing in the Claude browser pane stalls when the pane is hidden (the page pauses itself, as it should). The headless playtest doesn't have that problem.
