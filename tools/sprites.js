// Sprite tools for Rewind Patrol. Run from this game's folder.
//   node tools/sprites.js list     Register the PNGs in assets/sprites/ (rewrites assets/sprites/list.js).
//   node tools/sprites.js export   Save every built-in sprite to assets/templates/ at its exact in-game size, plus
//                                  assets/templates/SPRITES.md saying what each one is. Needs playwright-core.
const fs = require('fs');
const path = require('path');
const { serve } = require('./server');

const root = path.resolve(__dirname, '..');
const spritesDir = path.join(root, 'assets', 'sprites');
const templatesDir = path.join(root, 'assets', 'templates');

function list() {
  const keys = fs.readdirSync(spritesDir).filter(f => f.toLowerCase().endsWith('.png')).map(f => f.slice(0, -4)).sort();
  fs.writeFileSync(path.join(spritesDir, 'list.js'),
    '// Your own sprites in this folder that replace the built-in ones (file name = sprite name + .png).\n'
    + '// Rebuilt by `node tools/sprites.js list`; see assets/README.md.\n'
    + `const CUSTOM_SPRITES = ${JSON.stringify(keys, null, 2).replace(/"/g, "'")};\n`);
  console.log(keys.length ? `registered ${keys.length}: ${keys.join(', ')}` : 'no PNGs in assets/sprites/ (the game uses all built-in sprites)');
}

async function exportTemplates() {
  const { chromium } = (() => { try { return require('playwright'); } catch { return require('playwright-core'); } })();
  const server = await serve(root);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${server.url}/index.html`);
    await page.waitForFunction(() => typeof scene === 'function' && !!scene());
    await page.click('#main .primary');
    await page.click('#story .primary'); // starting a run makes sure every texture exists
    await page.waitForTimeout(800);
    const info = await page.evaluate(() => {
      // Phaser also keeps unnamed textures (text, tile sprites) under random ids, and the game makes glowing copies of
      // the shot sprites (key~color): skip those.
      const keys = game.textures.getTextureKeys().filter(k => !/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(k) && !k.includes('~'));
      const size = k => { const s = game.textures.get(k).getSourceImage(); return [s.width, s.height]; };
      return {
        sizes: Object.fromEntries(keys.map(k => [k, size(k)])),
        items: UPGRADES.filter(u => !u.active).map(u => ({ id: u.id, name: u.name, shape: u.shape })),
        eras: ERAS.map(e => ({ id: e.id, name: e.name, army: e.army, shot: e.shot, mid: e.mid.key, midName: e.mid.name.replace('\n', ' '),
          boss: e.boss.key, bossName: e.boss.name.replace('\n', ' '), obstacle: e.obstacle, vehicle: e.vehicle })),
      };
    });
    fs.mkdirSync(templatesDir, { recursive: true });
    for (const key of Object.keys(info.sizes)) {
      const dataUrl = await page.evaluate(k => game.textures.getBase64(k), key);
      fs.writeFileSync(path.join(templatesDir, `${key}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
    }
    fs.writeFileSync(path.join(templatesDir, 'SPRITES.md'), describe(info));
    console.log(`exported ${Object.keys(info.sizes).length} templates to assets/templates/`);
  } finally {
    await browser.close();
    server.close();
  }
}

// What every sprite is, grouped the way you'd go about redrawing them.
function describe({ sizes, items, eras }) {
  const used = new Set();
  const row = (key, what) => {
    if (!sizes[key] || used.has(key)) return '';
    used.add(key);
    return `| \`${key}.png\` | ${sizes[key][0]} x ${sizes[key][1]} | ${what} |\n`;
  };
  const table = rows => `| File | Size | What it is |\n|---|---|---|\n${rows.join('')}\n`;
  const frame = f => (f === 'Hurt' ? 'Hurt pose (shown when hit). All three frames must be the same size.' : `Idle animation, frame ${+f + 1} of 2.`);
  let md = '# Sprite list\n\nEvery built-in sprite, at the size it appears in the game. To replace one, see `../README.md`.\n\n';
  md += '## Vega and his gear\n\n' + table([
    row('vega0', 'Vega on foot, seen from above, facing up. Walk frame: feet together.'),
    row('vega1', 'Walk frame: left foot forward, right heel behind.'),
    row('vega2', 'Walk frame: right foot forward, left heel behind.'),
    row('partner', 'Backup Partner, seen from above.'),
    row('bulletUp', "Vega's bullet, also his partner's and drone's (points up; it's rotated to fly any direction)."),
    row('arrowUp', 'Longbow arrow / Archer Partner arrow (points up).'),
    row('axe', "Throwing axe (spins). Also Scandinavia's enemy shot."),
    row('boomerang', 'Bone Boomerang (spins).'),
    row('bull', 'Stampede cattle, seen from above, facing up.'),
    row('drone', 'Drone Buddy, seen from above.'),
    row('drillbolt', 'Plasma Drill bolt (points up).'),
    row('torpedo', 'Photon Torpedo (points up).'),
    row('molotov', 'Molotov bottle (spins).'),
  ]);
  md += '## Pickups and effects\n\n' + table([
    row('coin', 'Coin.'), row('donut', 'Donut (heals 1).'), row('coffee', 'Coffee (heals fully).'), row('part', 'Time-drive part.'),
    row('orb', "Bosses' energy shot."), row('boulder', 'Boulder (Siege Engine shot, Trebuchet, meteors).'),
    row('icicle', 'Icicle (Frost Giant shot, points down).'), row('dynamite', 'Dynamite (lobbed by Wild West bosses).'),
    row('stone', 'Stone (Stone Age shot; lobbed boss shots also burst into these).'),
    row('spark', 'Explosion spark (tinted).'), row('streak', 'Time-jump streak (tinted).'), row('road-1986', '1986 street, menu and ending. Road tile: repeats top to bottom, so the top and bottom edges must join.'),
  ]);
  for (const e of eras) {
    md += `## ${e.name}\n\n` + table([
      row(e.army.G, 'Grunt (foot soldier), front view, 12 x 12 pixels drawn at 4x.'),
      row(e.army.S, 'Sharpshooter (aims at Vega), front view.'),
      row(e.army.C, 'Charger (runs at Vega, never shoots), front view.'),
      row(e.army.H, 'Heavy (takes 4x the hits), front view, 14 x 14 pixels drawn at 4x.'),
      row(e.shot, 'Their shot (points down).'),
      ...['0', '1', 'Hurt'].map(f => row(`${e.mid}${f}`, `Mid-boss (wave 5): ${e.midName}. ${frame(f)}`)),
      ...['0', '1', 'Hurt'].map(f => row(`${e.boss}${f}`, `Boss (wave 10): ${e.bossName}. ${frame(f)}`)),
      row(`road-${e.id}`, 'Road tile, seen from above. Repeats top to bottom: the top and bottom edges must join.'),
      row(`hills-${e.id}`, 'Vehicle stages: distant scenery with a see-through sky. Repeats sideways: left and right edges must join.'),
      row(`ground-${e.id}`, 'Vehicle stages: the ground the vehicles race on. Repeats sideways: left and right edges must join.'),
      row(e.obstacle, 'Bonus chase: obstacle.'),
      ...[0, 1].map(f => row(`ride-${e.id}${f}`, `Bonus chase: Vega on the ${e.vehicle}, facing right and shooting ahead. Animation frame ${f + 1} of 2.`)),
      ...[0, 1].map(f => row(`rideE-${e.id}${f}`, `Bonus chase: an enemy rider on the ${e.vehicle}, facing right but turned back to shoot at Vega. Frame ${f + 1} of 2.`)),
    ]);
  }
  md += "## Backpack icons\n\nShown on each item's piece in the backpack (shop and pause menu). Items not listed here use one of the game's own sprites as their icon.\n\n"
    + table(items.map(u => row(`icon-${u.id}`, `${u.name} (a ${u.shape} piece).`)));
  const rest = Object.keys(sizes).filter(k => !used.has(k)).sort();
  if (rest.length) md += '## Everything else\n\n' + table(rest.map(k => row(k, '')));
  return md;
}

const cmd = process.argv[2];
if (cmd === 'list') list();
else if (cmd === 'export') exportTemplates().catch(e => { console.error(e); process.exit(1); });
else console.log('usage: node tools/sprites.js list | export');
