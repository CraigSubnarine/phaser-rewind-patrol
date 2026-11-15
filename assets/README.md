# Using your own sprites

Every sprite in the game is drawn by code, but any of them can be replaced by your own image, one at a time. Whatever you don't replace stays as it is.

## Replacing a sprite

1. Find the sprite in [`templates/SPRITES.md`](templates/SPRITES.md). It lists every sprite's file name, its size in the game, and what it is.
2. Start from the matching file in `templates/` (it's the current sprite at its exact in-game size) and draw your version.
3. Save it in `sprites/` with **the same file name**, e.g. `sprites/legionary.png`.
4. Register it: run `node tools/sprites.js list` from the game folder (or just ask Claude). This updates `sprites/list.js`, which tells the game which sprites to load: a website can't look inside a folder by itself.
5. Check it in the game (the `gamedev` preview server, http://localhost:8765/phaser-rewind-patrol/), then commit and push.

To go back to the built-in sprite, delete your PNG and run `node tools/sprites.js list` again.

## What makes a sprite work

- **PNG with a transparent background.** Anything not see-through will show as a box.
- **Size:** the template size is what the game was tuned for. Other sizes work: Vega's hitbox and gun position scale with his sprite, enemies and bosses use their whole image as their hitbox. Much bigger or smaller sprites change how hard the game feels, so keep close to the template sizes.
- **Which way things face:**
  - Vega on foot, the partner and the Stampede cattle are seen from above, facing up.
  - Foot soldiers and bosses face you (front view).
  - Enemy shots point down; Vega's shots point up. The game rotates them to fly in other directions.
  - Everything on vehicle stages faces right.
- **Animation frames:** sprites ending in a number are frames of one animation and should match each other:
  - `vega0` (feet together), `vega1` (left foot forward), `vega2` (right foot forward) make Vega's walk.
  - Each boss has three frames of the same size: `<boss>0` and `<boss>1` (its idle animation) and `<boss>Hurt` (shown when it's hit). Replace all three together.
  - Each vehicle has frames `0` and `1` (legs or wheels in two positions), for Vega facing forward (`ride-...-f`), Vega turned back (`ride-...-b`), and that timeline's enemy rider both ways (`rideE-...`). The rider and the vehicle are one image.
- **Repeating backgrounds:** roads (`road-...`) repeat top to bottom, so the top and bottom edges must join seamlessly; side-view scenery (`hills-...`, `ground-...`) repeats sideways, so the left and right edges must join. `hills-...` needs a see-through sky (the sky colour is behind it).
- **Effects still work:** frozen enemies turn blue, burning ones orange, and anything hit flashes white, whatever the image. Shots get a glow and a ring added around them in the game (pink for enemy shots, cyan for Vega's) so they stand out on every road: draw just the shot itself.
- **Pixel art vs smooth art:** the game scales images with hard edges, which keeps pixel art crisp. Smooth, high-resolution art would look jagged; if you go that way, ask Claude to switch `pixelArt` off in `js/game.js`.

## Refreshing the templates

If the built-in art changes, run `node tools/sprites.js export` to rewrite `templates/` (it needs the same `playwright-core` setup as the playtest).
