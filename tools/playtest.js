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
// that stays invincible with a full-power gun and parks under the nearest enemy, to reach later stages quickly.
function installHarness() {
  window.__T = performance.now();
  window.__step = n => { for (let i = 0; i < n; i++) { __T += 1000 / 60; game.step(__T, 1000 / 60); } };
  scene().tweens.getDelta = () => 1000 / 60; // tweens normally follow the wall clock; tie them to our frames
  // A tileSprite renders through its own generated texture; the road it shows is its displayTexture.
  window.roadKey = () => (scene().road.displayTexture ?? scene().road.texture).key;
  window.__bot = (expr, maxSeconds) => {
    const until = new Function(`return ${expr}`);
    for (let f = 0; f < maxSeconds * 60 && !until(); f++) {
      const s = scene();
      s.invulnUntil = Infinity;
      s.gun = 5;
      const targets = s.boss ? [s.boss] : s.enemies.getChildren().filter(e => e.y > 0);
      const tgt = targets.sort((a, b) => Math.abs(a.x - s.player.x) - Math.abs(b.x - s.player.x))[0];
      if (tgt && s.player.active) s.placePlayer(s.player.x + Phaser.Math.Clamp(tgt.x - s.player.x, -6, 6), H - 110);
      __step(1);
    }
    return until();
  };
}

const visible = (page, id) => page.evaluate(i => !document.getElementById(i).hidden && !document.getElementById('ui').hidden, id);
const BOSSES = [[5, 'champion'], [10, 'centurion'], [15, 'siege'], [20, 'grimhelm'], [25, 'kraken'], [30, 'blackpowder']];

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
  await page.evaluate(() => __step(60 * 2)); // time jump, then the first stage card
  const card = await page.evaluate(() => scene().lastBanner);
  check(`${name}: stage card shows the timeline`, /ROME/.test(card) && /44 BC/.test(card) && /STAGE 1\b/.test(card), JSON.stringify(card));
  await shot('2-stage-card');
  await page.evaluate(() => __step(60 * 3));
  const started = await page.evaluate(() => ({ state: app.state, stage: scene().stage, era: scene().era, enemies: scene().enemies.countActive(), road: roadKey() }));
  check(`${name}: stage 1 starts on the Roman road with a formation`,
    started.state === 'playing' && started.stage === 1 && started.enemies > 0 && started.road === 'road-rome', JSON.stringify(started));
  await shot('3-stage-1');

  await page.click('#pauseBtn');
  check(`${name}: pause button opens pause menu`, await visible(page, 'pause'));
  await page.click('#pause .primary');
  check(`${name}: resume`, await page.evaluate(() => app.state === 'playing'));

  const walk = await page.evaluate(() => {
    const s = scene(), seen = new Set(), road0 = s.road.tilePositionY;
    s.invulnUntil = Infinity;
    for (let i = 0; i < 40; i++) { __step(1); seen.add(s.player.texture.key); }
    s.invulnUntil = 0;
    return { frames: [...seen].sort().join(','), walking: s.player.anims.isPlaying, roadMoved: s.road.tilePositionY !== road0 };
  });
  check(`${name}: Vega keeps walking as the road scrolls`, walk.walking && walk.roadMoved && walk.frames === 'vega0,vega1,vega2', JSON.stringify(walk));

  if (name === 'phone') {
    const lives0 = await page.evaluate(() => scene().lives);
    for (const [stage, key] of BOSSES) {
      const got = await page.evaluate(n => { __bot(`scene().stage === ${n} && scene().boss?.ready`, 400); return { stage: scene().stage, boss: scene().boss?.texture.key }; }, stage);
      check(`${name}: boss on stage ${stage}`, got.stage === stage && got.boss === key, JSON.stringify(got));
      await page.evaluate(() => { __step(60); scene().boss?.clearTint(); }); // no white hit-flash in the picture
      await shot(`4-boss-stage-${stage}`);
      if (stage === 5) {
        const lives = await page.evaluate(() => { __bot('scene().stage === 6', 60); return scene().lives; });
        check(`${name}: mid-boss coffee gives an extra life`, lives === lives0 + 1, `${lives0} -> ${lives}`);
      }
      if (stage === 10 || stage === 20) {
        const next = await page.evaluate(n => {
          __bot(`scene().stage === ${n} && /STAGE ${n}\\b/.test(scene().lastBanner)`, 60);
          __step(30); // let the new road and the card fade in before the screenshot
          return { stage: scene().stage, card: scene().lastBanner, road: roadKey() };
        }, stage + 1);
        const want = stage === 10 ? ['ENGLAND', 'road-england'] : ['THE CARIBBEAN', 'road-caribbean'];
        check(`${name}: stage ${stage + 1} jumps to a new timeline`, next.card.includes(want[0]) && next.road === want[1], JSON.stringify(next));
        await shot(`5-stage-${stage + 1}-card`);
      }
    }
    const won = await page.evaluate(() => __bot(`app.state === 'won'`, 300));
    check(`${name}: beat all 30 stages and win`, won && (await page.textContent('#endTitle')) === 'CASE CLOSED');
    await shot('6-won');
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
  await shot('7-game-over');
  await page.click('#end button:not(.primary)');
  check(`${name}: back to main menu`, await visible(page, 'main'));

  if (name === 'phone') { // sprite sheet: every texture at 2x, for checking the pixel art
    await page.evaluate(() => {
      const sheet = document.createElement('div');
      sheet.style.cssText = 'position:fixed;inset:0;z-index:9;background:#140a26;display:flex;flex-wrap:wrap;gap:14px;padding:14px;align-content:flex-start;overflow:auto';
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
    await shot('8-sprites');
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
