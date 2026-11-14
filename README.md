# phaser-rewind-patrol

**Rewind Patrol**: a roguelike vertical arcade shooter in Phaser 3. Neon City, 1986: Officer Vega grabs a prototype time drive during a break-in call and gets thrown back through history, on foot (seen from above, feet stepping as he walks). Fight through each timeline, gear up between stages, beat the bosses, recover the missing time-drive parts, and get home.

No build step and no asset files: the pixel art is drawn from text grids in the code and the sounds are synthesized.

- **Play:** https://craigsubnarine.github.io/phaser-rewind-patrol/
- **Repo:** https://github.com/CraigSubnarine/phaser-rewind-patrol
- **Run locally:** the `gamedev` preview server at http://localhost:8765/phaser-rewind-patrol/ (opening `index.html` directly also works until you add your own sprites: browsers won't load images from `file://`)
- **Controls:** phone: drag anywhere (Vega walks towards your finger's movement, so your finger never covers him). Computer: Vega follows the mouse, or use arrow keys / WASD. He fires automatically. Active item: tap the item button (bottom right) or press Space / E when it glows. Pause with the top-right button or Esc / P.

## How a run works

- **7 timelines, 5 per run:** Rome 44 BC, England 1250, the Caribbean 1715, the Wild West 1881, Feudal Japan 1600, Scandinavia 900 (Vikings) and the Stone Age. The run's seed picks 5 of them, in a random order, for **waves 1-50** (10 waves each), each on a scrolling top-down road themed to its period. A "time jump" plays between timelines. Enemies and bosses get tougher with how far along you are, whichever timelines you got.
- **Levels:** each timeline is two levels of **5 waves played back to back**: a card at the start of the level (timeline, year, level, waves), then just a quick "WAVE n" call between waves, no stopping. The 5th wave is the boss:
  - Level 1 ends with a mid-boss (Arena Champion, Siege Engine, Kraken, Gatling Wagon, Oni, Berserker, Woolly Mammoth): coffee (full heal) and coins.
  - Level 2 ends with the timeline's boss (Iron Centurion, Sir Grimhelm, Captain Blackpowder, Colonel Rattler, Iron Shogun, Frost Giant, King Lizard): one of the 5 time-drive parts.
  - Other waves: formations that fly in and sway, and snaking lines, drawn as rows of letters in `STAGES`. Level 1 brings in one new soldier type per wave; level 2 mixes them all, busier towards the boss.
- **Soldiers:** every army has 4 types (`ROLES`), each with its own sprite and health (the run's toughness times a multiplier, so some take far more hits than others):
  - **Charger** (×0.5 health): never shoots; shakes for a moment, then runs down at Vega.
  - **Sharpshooter** (×1): flashes red, then fires a fast shot aimed straight at Vega.
  - **Grunt** (×1.5): lobs shots roughly Vega's way.
  - **Heavy** (×4, bigger): fires a spread of 3, worth 3× the points, always drops a coin.
  - Soldiers that take more than one hit show a health bar once hit. Rome: archer, gladiator, praetorian. England: longbowman, pikeman, mace knight. Caribbean: musketeer, swashbuckler, powder-keg brute. West: rifleman, bandito, bruiser. Japan: yumi archer, ashigaru, samurai. Scandinavia: spear thrower, raider, huscarl. Stone Age: slinger, sabre-tooth, club brute.
- **Bosses:** big animated sprites (two idle frames and a hurt pose) that fight in **phases**: a mid-boss changes at half health, a timeline boss at 2/3 and 1/3, each time with a taunt, a hurt pose and a new set of attacks (`phases` in `ERAS`). Attacks (`Play.bossAttack`): fan, aimed burst, ring, spiral, wall with a gap, rain from the top, mortars lobbed at a marked spot that burst into stones, a sweeping gun, lane slams (columns flash red first), a charge down at Vega, and summoning soldiers from their army. Examples: the Kraken submerges and slams tentacles down lanes; the Siege Engine lobs boulders; Captain Blackpowder fires broadside walls and barrels; the Iron Shogun blinks around in a shuriken spiral; the King Lizard charges and sweeps its tail.
- **Bonus levels:** a mini-boss level sometimes (`BONUS_CHANCE`, 50%, seeded) leads into a 45-second side-view bonus level on the timeline's ride (chariot, horse, rowboat or longboat, raptor), either a **chase** (riders ahead look back to shoot at you; you shoot ahead) or an **escape** (riders behind chase you; you shoot backwards). The timeline boss's level never has one. Riders keep coming, weave and try to ram you; rocks, barrels, cacti or icebergs come at you from ahead and soak up shots. Every rider you take down pays out at the end, and a hit costs coins, never HP, so a bonus level can't end your run.
- **After wave 50:** with all 5 parts, choose **Return to 1986** (the ending) or **Go endless**: the run keeps going with a new seeded timeline every 10 waves (never the same twice in a row), tougher each time; bosses drop coffee and coins instead of parts.
- **Health:** 3 HP on Normal (5 on Easy). Donuts heal 1. When HP runs out, the run is over.
- **Coins and the shop:** 1 enemy in 5 drops a coin (`COIN_CHANCE`); clearing waves, bosses and bonus levels pays out too. After every level (twice per timeline) you visit that timeline's market: 4 cards (up to 2 pieces of that timeline's gear, the rest general gear), plus Reroll and Coffee (+1 HP). Prices rise 50% per copy you own.
- **Upgrades** (`UPGRADES` in `js/data.js`, 39 in all): general gear (fire rate, damage, multi-shot, max HP, speed, coin magnet, crits, a backup partner) and timeline gear only sold in its own timeline:
  - Rome: piercing, a recharging shield, full-HP damage. England: longbow, armor, boss damage. Caribbean: cannon, ricochet, more coins.
  - Wild West: Six-Shooter fans, Dynamite (kills explode), Deadeye crits. Feudal Japan: Shuriken Ring (orbiting stars), Bushido (last-HP damage), Ninja Step. Scandinavia: Throwing Axes, Berserker Rage (faster when hurt), Hearth Fire (heal per stage). Stone Age: Fire (burning), Bone Boomerang, Mammoth Hide.
- **Active items:** charge up as you defeat enemies, then fire with the item button. One at a time (buying another swaps it). Air Support (clear the screen), VCR Remote (skip the stage), Police Siren (freeze enemies), and one per timeline: Testudo, Trebuchet Call, Broadside, Stampede, Petal Storm, Thunder Hammer, Meteor Shower.
- **Combos** (`COMBOS`, 21): owning both halves unlocks a bonus, e.g. Pilum + Longbow = Volley Fire, Dynamite + Ship's Cannon = Chain Reaction, Throwing Axes + Bone Boomerang = Returning Axes, Bushido + Berserker Rage = Last Stand. Since each run visits a different 5 timelines, which combos are even possible changes from run to run. Shop cards say which combo an item starts or completes.
- **Seeds:** every run has a seed (shown on the story screen, pause menu and end screen; you can type your own). The same seed gives the same 5 timelines, the same endless timelines and the same shop offers. The pause menu shows the run's route.
- Menu, story screen, settings (difficulty, sound), pause, game over and win screens. Best score kept per difficulty.

## Your own sprites

Any built-in sprite can be swapped for your own PNG: put it in `assets/sprites/` with the sprite's name and run `node tools/sprites.js list`. `assets/templates/` has every current sprite at its exact size to draw over, and `assets/templates/SPRITES.md` says what each one is. Full guide: [`assets/README.md`](assets/README.md).

## Code layout

- `index.html`: the page, menus (HTML/CSS) and script tags.
- `js/data.js`: constants, timelines, stage table, difficulty, upgrades, combos, and the pure `computeStats` / `priceOf` helpers.
- `js/art.js`: pixel-art grids, Vega's walk frames, and the road tiles.
- `js/ui.js`: settings, sound, menus, the shop screen, the item button, input.
- `js/game.js`: the Phaser scene (stage flow, shooting, enemies, bosses, items). `preload()` loads your own sprites; `create()` generates the rest.
- `assets/`: your own sprites (`sprites/`) and the templates to draw them from (`templates/`).
- `tools/`: `playtest.js`, `sprites.js` (register / export sprites) and `server.js` (the local web server both use).

## Playtest

`node tools/playtest.js` plays the game headlessly on a phone and a desktop screen: menus, pause, seeds (same route and shop), stage cards, the shop (buy, reroll, heal, combos), every active item, the later timelines' gear, all 50 stages of the seeded route (every vehicle stage, all 10 bosses, every timeline change), the stage-50 choice both ways (endless to stage 61, and home), and game over. It saves screenshots to `playtest-output/` (git-ignored) and fails on any page error. It needs the `playwright-core` package; on this PC it's in the npx cache:

```powershell
$env:NODE_PATH = "$env:LOCALAPPDATA\npm-cache\_npx\e41f203b7505f1fb\node_modules"; node tools/playtest.js
```

## Adding things

- **An upgrade:** add an entry to `UPGRADES` (give it `era` to make it timeline gear, `active` to make it an active item and handle its `effect` in `useActive()`), and maybe a `COMBOS` entry pairing it with something from another timeline.
- **A timeline:** add an entry to `ERAS` (name, year, road, colors, enemy and shot sprites, mid-boss and boss, part name, vehicle, rider colors, sky, obstacle), draw its art in `js/art.js`, its road in `makeRoads` and its side-view scenery in `makeSides`, and give it some timeline gear. It joins the pool the seed picks from automatically.

## Lessons

- `this.textures.generate()` turns text grids into pixel-art textures: no image files or editor needed.
- Walk cycle: one top-down body drawing plus a helper that paints the shoes in three positions, played as a 4-frame loop while the road scrolls under Vega.
- Side-view riders are built from parts: one rider grid (recolored per timeline, mirrored to look backwards) composed onto a two-frame vehicle (legs or wheel spokes alternate). One `compose` helper, no hand-drawn combinations.
- Roads are a `tileSprite` whose `tilePositionY` slides every frame; each road is drawn once with Graphics into a 256px tile that repeats seamlessly (seeded random so it looks the same every time).
- Restarting the Phaser scene for a new game wipes every enemy, timer and tween from the last run in one go.
- Upgrades as data: stats are recomputed from scratch (`computeStats`) whenever something is bought, so stacking and combos can't drift out of sync.
- A seeded `RandomDataGenerator` only for the shop keeps runs reproducible without making enemy behaviour deterministic.
- Phaser tweens run on the wall clock while physics and timers run on frame time, so a test that steps frames manually has to feed tweens the same frame time.
- Testing in the Claude browser pane stalls when the pane is hidden (the page pauses itself, as it should). The headless playtest doesn't have that problem.
