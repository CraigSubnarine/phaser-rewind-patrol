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

// Installed in the page: step the game a frame at a time (much faster than real time), and a simple bot that
// stays invincible with a strong gun, parks under the nearest enemy, and in the shop buys whatever it can afford.
function installHarness() {
  window.__T = performance.now();
  window.__step = n => { for (let i = 0; i < n; i++) { __T += 1000 / 60; game.step(__T, 1000 / 60); } };
  scene().tweens.getDelta = () => 1000 / 60; // tweens normally follow the wall clock; tie them to our frames
  // A tileSprite renders through its own generated texture; the road it shows is its displayTexture.
  window.roadKey = () => (scene().road.displayTexture ?? scene().road.texture).key;
  window.__shopBot = () => {
    let card;
    while ((card = document.querySelector('#shopItems .card:not(:disabled)'))) card.click();
    document.querySelector('#shop [data-action=continue]').click();
  };
  window.__bot = (expr, maxSeconds) => {
    const until = new Function(`return ${expr}`);
    for (let f = 0; f < maxSeconds * 60 && !until(); f++) {
      if (app.state === 'shop') { __shopBot(); continue; }
      const s = scene();
      s.invulnUntil = Infinity;
      s.P.dmg = Math.max(s.P.dmg, 5);
      s.P.fireDelay = Math.min(s.P.fireDelay, 120);
      s.P.shots = Math.max(s.P.shots, 3);
      window.__obstacles = Math.max(window.__obstacles || 0, s.obstacles.countActive());
      if (s.view === 'side') { // line up vertically with the nearest rider
        const tgt = s.enemies.getChildren().filter(e => e.x > 0 && e.x < W).sort((a, b) => Math.abs(a.y - s.player.y) - Math.abs(b.y - s.player.y))[0];
        if (tgt && s.player.active) s.placePlayer(s.player.x, s.player.y + Phaser.Math.Clamp(tgt.y - s.player.y, -6, 6));
      } else {
        const targets = s.boss ? [s.boss] : s.enemies.getChildren().filter(e => e.y > 0);
        const tgt = targets.sort((a, b) => Math.abs(a.x - s.player.x) - Math.abs(b.x - s.player.x))[0];
        if (tgt && s.player.active) s.placePlayer(s.player.x + Phaser.Math.Clamp(tgt.x - s.player.x, -6, 6), H - 110);
      }
      __step(1);
    }
    return until();
  };
}

const visible = (page, id) => page.evaluate(i => !document.getElementById(i).hidden && !document.getElementById('ui').hidden, id);
// Checkpoints through a full run, in stage order: vehicle stages (3 = chase, 8 = escape), back on foot, and bosses.
const CHECKPOINTS = [
  [3, 'chase', 'rome'], [4, 'top'], [5, 'boss', 'champion'], [8, 'escape', 'rome'], [10, 'boss', 'centurion'],
  [13, 'chase', 'england'], [15, 'boss', 'siege'], [18, 'escape', 'england'], [20, 'boss', 'grimhelm'],
  [23, 'chase', 'caribbean'], [25, 'boss', 'kraken'], [28, 'escape', 'caribbean'], [30, 'boss', 'blackpowder'],
];

// Start a run from the main menu with a given seed and play until the first shop; returns its offers.
async function firstShop(page, seed) {
  await page.evaluate(() => toMenu());
  await page.evaluate(() => __step(3));
  await page.click('#main .primary');
  await page.fill('#seedInput', seed);
  await page.click('#story .primary');
  await page.evaluate(() => { __step(2); scene().tweens.getDelta = () => 1000 / 60; });
  await page.evaluate(() => __bot(`app.state === 'shop'`, 120));
  return page.evaluate(() => app.shop.offers.map(u => u.id).join(','));
}

async function run(browser, name, options) {
  const ctx = await browser.newContext(options);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${m.text()} ${m.location()?.url ?? ''}`.trim()); });
  // After the bot fast-forwards, the game's real clock would try to catch up minutes at once and stall the next
  // painted frame; resetting it first keeps screenshots quick. (Real play runs at a steady 60 fps.)
  const shot = file => page.evaluate(() => game.loop.resetDelta())
    .then(() => page.screenshot({ path: path.join(out, `${name}-${file}.png`), timeout: 15000 }))
    .catch(e => check(`${name}: screenshot ${file}`, false, e.message.split('\n')[0]));

  await page.goto(url);
  await page.waitForFunction(() => typeof scene === 'function' && !!scene(), null, { timeout: 15000 });
  await page.evaluate(installHarness);
  check(`${name}: main menu on load`, await visible(page, 'main'));
  await shot('1-menu');

  await page.click('#main .primary');
  check(`${name}: Play opens the story with a seed`, (await visible(page, 'story')) && (await page.inputValue('#seedInput')).length === 6);
  await page.fill('#seedInput', 'TEST1');
  await page.click('#story .primary');
  await page.evaluate(() => __step(60 * 2)); // time jump, then the first stage card
  const card = await page.evaluate(() => scene().lastBanner);
  check(`${name}: stage card shows the timeline`, /ROME/.test(card) && /44 BC/.test(card) && /STAGE 1\b/.test(card), JSON.stringify(card));
  await shot('2-stage-card');
  await page.evaluate(() => __step(60 * 3));
  const started = await page.evaluate(() => ({ state: app.state, stage: scene().stage, seed: app.seed, enemies: scene().enemies.countActive(), road: roadKey(), hp: scene().hp }));
  check(`${name}: stage 1 starts on the Roman road with seed TEST1`,
    started.state === 'playing' && started.stage === 1 && started.enemies > 0 && started.road === 'road-rome' && started.seed === 'TEST1' && started.hp === 3, JSON.stringify(started));
  await shot('3-stage-1');

  await page.click('#pauseBtn');
  check(`${name}: pause shows the seed and build`, (await visible(page, 'pause')) && /Seed TEST1/.test(await page.textContent('#pauseBuild')));
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

  // ----- The shop -----
  const coinsBefore = await page.evaluate(() => { __bot(`app.state === 'shop'`, 120); return scene().coins; });
  check(`${name}: clearing stage 1 opens the shop with coins earned`, (await visible(page, 'shop')) && coinsBefore > 0, `$${Math.floor(coinsBefore)}`);
  await shot('4-shop');
  const offers1 = await page.evaluate(() => app.shop.offers.map(u => u.id).join(','));
  const bought = await page.evaluate(() => {
    const s = scene();
    s.coins = 100;
    renderShop();
    const before = { coins: s.coins, stats: JSON.stringify(s.P), hp: s.hp };
    document.querySelector('#shopItems .card:not(:disabled)').click();
    return { spent: before.coins - s.coins, owned: Object.keys(s.owned).length, changed: JSON.stringify(s.P) !== before.stats || s.hp !== before.hp };
  });
  check(`${name}: buying an upgrade spends coins and changes Vega`, bought.spent > 0 && bought.owned === 1 && bought.changed, JSON.stringify(bought));
  const reroll = await page.evaluate(() => {
    const s = scene(), before = app.shop.offers.map(u => u.id).join(','), coins = s.coins;
    document.getElementById('rerollBtn').click();
    return { spent: coins - s.coins, changed: app.shop.offers.map(u => u.id).join(',') !== before };
  });
  check(`${name}: reroll costs coins and deals new cards`, reroll.spent === 3, JSON.stringify(reroll));
  const heal = await page.evaluate(() => {
    const s = scene();
    s.hp = 1;
    renderShop();
    document.getElementById('healBtn').click();
    return s.hp;
  });
  check(`${name}: coffee in the shop heals 1`, heal === 2, `hp ${heal}`);
  await page.click('#shop [data-action=continue]');
  check(`${name}: next stage after the shop`, await page.evaluate(() => { __step(10); return app.state === 'playing' && scene().stage === 2; }));

  if (name === 'phone') {
    const combo = await page.evaluate(() => {
      const s = scene();
      s.coins = 500;
      const unlocked = [s.buy(UPGRADE.pilum), s.buy(UPGRADE.longbow)].flat().map(c => c.id);
      return { unlocked, longbowEvery: s.P.longbowEvery, pierce: s.P.pierce };
    });
    check(`${name}: Pilum + Longbow unlocks the Volley Fire combo`, combo.unlocked.includes('volley') && combo.longbowEvery === 2 && combo.pierce >= 1, JSON.stringify(combo));

    // ----- Active items -----
    const waitForEnemies = () => page.evaluate(() => {
      const s = scene(), onScreen = () => s.enemies.getChildren().filter(e => e.y > 0 && e.y < H).length;
      s.invulnUntil = Infinity;
      for (let i = 0; i < 1200 && onScreen() < 3; i++) __step(1);
      return onScreen();
    });
    await page.evaluate(() => { const s = scene(); s.coins = 999; s.buy(UPGRADE.airsupport); });
    const air = await page.evaluate(() => {
      const s = scene(), r = { button: !document.getElementById('itemBtn').hidden, early: s.useActive() };
      s.charge = s.chargeNeeded();
      updateItemBtn();
      r.ready = document.getElementById('itemBtn').classList.contains('ready');
      return r;
    });
    const before = await waitForEnemies();
    await shot('4b-item-ready');
    const cleared = await page.evaluate(() => {
      const s = scene();
      s.charge = s.chargeNeeded();
      document.getElementById('itemBtn').click();
      return { left: s.enemies.getChildren().filter(e => e.y > -20).length, charge: s.charge };
    });
    check(`${name}: Air Support button shows, waits for its charge, then clears the screen`,
      air.button && air.early === false && air.ready && before >= 3 && cleared.left === 0 && cleared.charge === 0, JSON.stringify({ air, before, cleared }));

    const skip = await page.evaluate(() => {
      const s = scene();
      s.buy(UPGRADE.remote);
      const swapped = !s.owned.airsupport && s.P.active.id === 'remote';
      const stage = s.stage;
      s.charge = s.chargeNeeded();
      s.stage = 5; // pretend it's a boss stage
      const refused = s.useActive() === false;
      s.stage = stage;
      return { swapped, refused, stage };
    });
    await waitForEnemies();
    const skipped = await page.evaluate(() => {
      const s = scene();
      s.charge = s.chargeNeeded();
      const fired = s.useActive();
      __step(100);
      return { fired, state: app.state, stage: s.stage };
    });
    check(`${name}: VCR Remote replaces the old item, refuses boss stages, skips to the shop`,
      skip.swapped && skip.refused && skipped.fired && skipped.state === 'shop' && skipped.stage === skip.stage, JSON.stringify({ skip, skipped }));
    await page.click('#shop [data-action=continue]');

    await page.evaluate(() => scene().buy(UPGRADE.siren));
    await waitForEnemies();
    const freeze = await page.evaluate(() => {
      const s = scene();
      s.charge = s.chargeNeeded();
      s.useActive();
      const e = s.enemies.getChildren().find(x => x.y > 0), at = [e.x, e.y];
      __step(60);
      return { still: e.active ? e.x === at[0] && e.y === at[1] : 'killed', shots: s.enemyShots.countActive() };
    });
    check(`${name}: Siren freezes enemies and clears their shots`, freeze.still !== false && freeze.shots === 0, JSON.stringify(freeze));

    const wall = await page.evaluate(() => {
      const s = scene();
      const unlocked = [s.buy(UPGRADE.testudo), s.buy(UPGRADE.scutum)].flat().map(c => c.id);
      return { unlocked, ms: s.P.testudoMs, shield: s.shield };
    });
    check(`${name}: Testudo + Scutum unlocks Shield Wall`, wall.unlocked.includes('shieldwall') && wall.ms === 10000 && wall.shield === 1, JSON.stringify(wall));

    // Same seed: same first shop. (offers1 came from seed TEST1 before buying anything.)
    const again = await firstShop(page, 'TEST1');
    const other = await firstShop(page, 'OTHER9');
    check(`${name}: same seed rolls the same shop, a different seed doesn't`, again === offers1 && other !== offers1, `${offers1} | ${again} | ${other}`);
    await page.click('#shop [data-action=continue]');

    for (const [stage, kind, key] of CHECKPOINTS) {
      if (kind === 'chase' || kind === 'escape') {
        const v = await page.evaluate(n => {
          // the bot's late-game build can kill each rider as it appears, so wait for the view, not for riders
          __bot(`scene().stage === ${n} && scene().view === 'side' && app.state === 'playing'`, 200);
          const s = scene();
          __step(30);
          const vx = s.bullets.getChildren().reduce((sum, b) => sum + b.body.velocity.x, 0);
          return { stage: s.stage, view: s.view, mode: s.sideMode, anim: s.player.anims.currentAnim?.key, ground: s.ground.visible, road: s.road.visible, shots: Math.sign(vx) };
        }, stage);
        const want = { stage, view: 'side', mode: kind, anim: `ride-${key}-${kind === 'chase' ? 'f' : 'b'}`, ground: true, road: false, shots: kind === 'chase' ? 1 : -1 };
        check(`${name}: stage ${stage} is a side-view ${kind} in ${key}, shooting ${kind === 'chase' ? 'ahead' : 'behind'}`, JSON.stringify(v) === JSON.stringify(want), JSON.stringify(v));
        await shot(`5-stage-${stage}-${kind}`);
        continue;
      }
      if (kind === 'top') {
        const v = await page.evaluate(n => {
          __bot(`scene().stage === ${n} && app.state === 'playing'`, 200);
          __step(30);
          return { view: scene().view, anim: scene().player.anims.currentAnim?.key, road: scene().road.visible, obstacles: window.__obstacles };
        }, stage);
        check(`${name}: back on foot for stage ${stage} (and rocks showed up in the chase)`, v.view === 'top' && v.anim === 'walk' && v.road && v.obstacles >= 1, JSON.stringify(v));
        continue;
      }
      // Look for the boss arriving: by late stages the bot's build can kill it the moment it becomes hittable.
      const got = await page.evaluate(n => { __bot(`scene().stage === ${n} && scene().boss`, 400); return { stage: scene().stage, boss: scene().boss?.texture.key }; }, stage);
      check(`${name}: boss on stage ${stage}`, got.stage === stage && got.boss === key, JSON.stringify(got));
      await page.evaluate(() => { __step(140); scene().boss?.clearTint(); }); // let it fly in; no white hit-flash in the picture
      await shot(`5-boss-stage-${stage}`);
      if (stage === 5) {
        const hp = await page.evaluate(() => { scene().hp = 1; __bot(`app.state === 'shop'`, 60); return { hp: scene().hp, max: scene().P.maxHp }; });
        check(`${name}: mid-boss coffee heals fully`, hp.hp === hp.max, JSON.stringify(hp));
      }
      if (stage === 10 || stage === 20) {
        const next = await page.evaluate(n => {
          __bot(`scene().stage === ${n} && /STAGE ${n}\\b/.test(scene().lastBanner)`, 60);
          __step(30); // let the new road and the card fade in before the screenshot
          return { stage: scene().stage, card: scene().lastBanner, road: roadKey(), parts: scene().parts };
        }, stage + 1);
        const want = stage === 10 ? ['ENGLAND', 'road-england', 1] : ['THE CARIBBEAN', 'road-caribbean', 2];
        check(`${name}: stage ${stage + 1} jumps to a new timeline with ${want[2]} part(s)`, next.card.includes(want[0]) && next.road === want[1] && next.parts === want[2], JSON.stringify(next));
        await shot(`6-stage-${stage + 1}-card`);
      }
    }
    const won = await page.evaluate(() => __bot(`app.state === 'won'`, 300));
    check(`${name}: beat all 30 stages and win`, won && (await page.textContent('#endTitle')) === 'CASE CLOSED');
    await shot('7-won');
    await page.click('#end .primary');
    await page.evaluate(() => __step(5));
  }

  // Lose every life: game over screen
  await page.evaluate(() => {
    const s = scene();
    s.P.armor = 0;
    s.shield = 0;
    while (s.hp > 0) { s.invulnUntil = 0; s.hitPlayer(); __step(10); }
    __step(90);
  });
  check(`${name}: game over screen`, (await visible(page, 'end')) && (await page.textContent('#endTitle')) === 'GAME OVER');
  await shot('8-game-over');
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
    await shot('9-sprites');
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
