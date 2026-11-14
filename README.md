# phaser-rewind-patrol

**Rewind Patrol**: a vertical arcade shooter in Phaser 3. Neon City, 1986: Officer Vega grabs a prototype time drive during a break-in call and gets thrown back through history, on foot (seen from above, feet stepping as Vega walks). Fight each era's army, beat its boss, recover the three missing time-drive parts, and get home.

One `index.html`, no build step, no asset files: the pixel art is drawn from text grids in the code and the sounds are synthesized.

- **Play:** https://craigsubnarine.github.io/phaser-rewind-patrol/
- **Repo:** https://github.com/CraigSubnarine/phaser-rewind-patrol
- **Run locally:** open `index.html`, or the `gamedev` preview server at http://localhost:8765/phaser-rewind-patrol/
- **Controls:** phone: drag anywhere (Vega moves with your finger, so your finger never covers the character). Computer: Vega follows the mouse, or use arrow keys / WASD. Vega fires automatically. Pause with the button in the top-right corner or Esc / P.
- **Status:** v1 playable on phones and desktop. 3 eras (Rome 44 BC, England 1250, the Caribbean 1715), each with 3 waves (formation, snaking lines, dive-bombers) and a boss. Gold badges upgrade the gun (5 levels; you lose one level when hit), donuts are bonus points. Menu, story screen, settings (difficulty, sound), pause, game over and win screens. Best score kept per difficulty.

## Playtest

`node tools/playtest.js` plays the game headlessly on a phone and a desktop screen (menus, pause, all three eras and bosses, winning, game over), saves screenshots to `playtest-output/` (git-ignored) and fails on any page error. It needs the `playwright-core` package; on this PC it's in the npx cache:

```powershell
$env:NODE_PATH = "$env:LOCALAPPDATA\npm-cache\_npx\e41f203b7505f1fb\node_modules"; node tools/playtest.js
```

## Adding an era

Add an entry to `ERAS` (name, year, colors, enemy/shot/boss sprite names, boss name and health, part name), draw its enemy, shot and boss in `ART`, and bump nothing else: the HUD and story use `ERAS.length`. Ideas: Wild West outlaws, feudal Japan, prehistoric cavemen on pterodactyls.

## Lessons

- `this.textures.generate()` turns text grids into pixel-art textures: no image files or editor needed.
- Walk cycle: one top-down body drawing plus a helper that paints the shoes in three positions (together, left forward, right forward), played as a 4-frame loop only while the character is moving.
- Restarting the Phaser scene for a new game wipes every enemy, timer and tween from the last run in one go; much safer than resetting things by hand.
- Phaser tweens run on the wall clock while physics and timers run on frame time, so a test that steps frames manually has to feed tweens the same frame time.
- Testing in the Claude browser pane stalls when the pane is hidden (the page pauses itself, as it should). The headless playtest doesn't have that problem.
