// Headless playtest for Rewind Patrol: drives the real page in Chromium on a phone and a desktop screen,
// checks the main flows, saves screenshots to playtest-output/ and exits 1 on any failure or page error.
// Run from this game's folder: node tools/playtest.js   (needs the playwright or playwright-core package + its Chromium)
const path = require('path');
const fs = require('fs');
const { chromium } = (() => { try { return require('playwright'); } catch { return require('playwright-core'); } })();

const url = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
const out = path.resolve(__dirname, '..', 'playtest-output');
fs.mkdirSync(out, { recursive: true });
const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures.push(name);
};

// Installed in the page: step the game a frame at a time (much faster than real time), and a simple bot
// that stays invincible and parks under the nearest enemy, used to reach later eras quickly.
function installHarness() {
  window.__T = performance.now();
  window.__step = n => { for (let i = 0; i < n; i++) { __T += 1000 / 60; game.step(__T, 1000 / 60); } };
  scene().tweens.getDelta = () => 1000 / 60; // tweens normally follow the wall clock; tie them to our frames
  window.__bot = (expr, maxSeconds) => {
    const until = new Function(`return ${expr}`);
    for (let f = 0; f < maxSeconds * 60 && !until(); f++) {
      const s = scene();
      s.invulnUntil = Infinity;
      const targets = s.boss ? [s.boss] : s.enemies.getChildren().filter(e => e.y > 0);
      const tgt = targets.sort((a, b) => Math.abs(a.x - s.player.x) - Math.abs(b.x - s.player.x))[0];
      if (tgt && s.player.active) s.placePlayer(s.player.x + Phaser.Math.Clamp(tgt.x - s.player.x, -6, 6), H - 110);
      __step(1);
    }
    return until();
  };
}

const visible = (page, id) => page.evaluate(i => !document.getElementById(i).hidden && !document.getElementById('ui').hidden, id);

async function run(browser, name, options) {
  const ctx = await browser.newContext(options);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${m.text()} ${m.location()?.url ?? ''}`.trim()); });
  const shot = file => page.screenshot({ path: path.join(out, `${name}-${file}.png`) });

  await page.goto(url);
  await page.waitForFunction(() => typeof scene === 'function' && !!scene(), null, { timeout: 15000 });
  await page.evaluate(installHarness);
  check(`${name}: main menu on load`, await visible(page, 'main'));
  await shot('1-menu');

  await page.click('#main .primary');
  check(`${name}: Play opens the story`, await visible(page, 'story'));
  await page.click('#story .primary');
  await page.evaluate(() => __step(60 * 5));
  const started = await page.evaluate(() => ({ state: app.state, era: scene().era, enemies: scene().enemies.countActive() }));
  check(`${name}: patrol starts in Rome with a formation`, started.state === 'playing' && started.era === 0 && started.enemies > 0, JSON.stringify(started));
  await shot('2-rome-formation');

  await page.click('#pauseBtn');
  check(`${name}: pause button opens pause menu`, await visible(page, 'pause'));
  await page.click('#pause .primary');
  check(`${name}: resume`, await page.evaluate(() => app.state === 'playing'));

  const walk = await page.evaluate(() => {
    const s = scene(), seen = new Set();
    s.invulnUntil = Infinity;
    for (let i = 0; i < 40; i++) { s.placePlayer(s.player.x + (i < 20 ? 3 : -3), s.player.y); __step(1); seen.add(s.player.texture.key); }
    const walking = s.player.anims.isPlaying;
    __step(30);
    s.invulnUntil = 0;
    return { frames: [...seen].sort().join(','), walking, standing: !s.player.anims.isPlaying && s.player.texture.key === 'vega0' };
  });
  check(`${name}: feet step while moving, come together when stopped`,
    walk.walking && walk.standing && walk.frames === 'vega0,vega1,vega2', JSON.stringify(walk));

  if (name === 'phone') {
    for (let era = 0; era < 3; era++) {
      const reached = await page.evaluate(e => __bot(`scene().era === ${e} && scene().boss?.ready`, 300), era);
      check(`${name}: reach boss ${era + 1}`, reached);
      await page.evaluate(() => { __step(60); scene().boss?.clearTint(); }); // no white hit-flash in the picture
      await shot(`3-boss-${era + 1}`);
    }
    const won = await page.evaluate(() => __bot(`app.state === 'won'`, 300));
    check(`${name}: beat all three eras and win`, won && (await page.textContent('#endTitle')) === 'CASE CLOSED');
    await shot('4-won');
    await page.click('#end .primary');
    await page.evaluate(() => __step(5));
  }

  // Lose every life: game over screen
  await page.evaluate(() => {
    const s = scene();
    while (s.lives > 0) { s.invulnUntil = 0; s.hitPlayer(); __step(70); }
    __step(90);
  });
  check(`${name}: game over screen`, (await visible(page, 'end')) && (await page.textContent('#endTitle')) === 'GAME OVER');
  await shot('5-game-over');
  await page.click('#end button:not(.primary)');
  check(`${name}: back to main menu`, await visible(page, 'main'));

  if (name === 'phone') { // sprite sheet: every texture at 2x, for checking the pixel art
    await page.evaluate(() => {
      const sheet = document.createElement('div');
      sheet.style.cssText = 'position:fixed;inset:0;z-index:9;background:#140a26;display:flex;flex-wrap:wrap;gap:14px;padding:14px;align-content:flex-start';
      for (const key of Object.keys(ART).sort((a, b) => b.startsWith('vega') - a.startsWith('vega'))) { // player first
        const img = new Image();
        img.onload = () => { img.width = img.naturalWidth * 2; };
        img.style.imageRendering = 'pixelated';
        img.src = game.textures.getBase64(key);
        sheet.append(img);
      }
      document.body.append(sheet);
    });
    await page.waitForTimeout(300);
    await shot('6-sprites');
  }

  check(`${name}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  try {
    await run(browser, 'phone', { viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
    await run(browser, 'desktop', { viewport: { width: 1280, height: 720 } });
  } finally {
    await browser.close();
  }
  console.log(failures.length ? `\n${failures.length} failed` : `\nall passed; screenshots in ${out}`);
  process.exit(failures.length ? 1 : 0);
})();
