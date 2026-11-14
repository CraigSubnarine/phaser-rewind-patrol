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
// stays invincible with a strong gun, lines up with the nearest enemy, and in the shop buys whatever it can afford.
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
      if (app.state !== 'playing') break; // choice screen, game over...
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

// Every checkpoint of a 50-stage run, from the run's own route (the seed picks 5 timelines out of 7).
const checkpointsFor = route => route.flatMap((era, i) => [
  [i * 10 + 3, 'chase', era.id],
  ...(i === 0 ? [[4, 'top']] : []),
  [i * 10 + 5, 'boss', era.mid],
  [i * 10 + 8, 'escape', era.id],
  [i * 10 + 10, 'boss', era.boss],
  ...(i < 4 ? [[i * 10 + 11, 'timeline', route[i + 1]]] : []),
]);

// Start a run from the main menu with a given seed and play until the first shop; returns its offers and route.
async function firstShop(page, seed) {
  await page.evaluate(() => toMenu());
  await page.evaluate(() => __step(3));
  await page.click('#main .primary');
  await page.fill('#seedInput', seed);
  await page.click('#story .primary');
  await page.evaluate(() => { __step(2); scene().tweens.getDelta = () => 1000 / 60; });
  await page.evaluate(() => __bot(`app.state === 'shop'`, 120));
  return page.evaluate(() => ({ offers: app.shop.offers.map(u => u.id).join(','), route: scene().route.map(e => e.id).join(',') }));
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
  const card = await page.evaluate(() => ({ card: scene().lastBanner, era: scene().E.name.toUpperCase(), year: scene().E.year, route: scene().route.length }));
  check(`${name}: stage card shows the timeline the seed picked`, card.card.includes(card.era) && card.card.includes(card.year) && /STAGE 1\b/.test(card.card) && card.route === 5, JSON.stringify(card));
  await shot('2-stage-card');
  await page.evaluate(() => __step(60 * 3));
  const started = await page.evaluate(() => ({ state: app.state, stage: scene().stage, seed: app.seed, enemies: scene().enemies.countActive(), road: roadKey(), want: scene().E.road, hp: scene().hp }));
  check(`${name}: stage 1 starts on that timeline's road with seed TEST1`,
    started.state === 'playing' && started.stage === 1 && started.enemies > 0 && started.road === started.want && started.seed === 'TEST1' && started.hp === 3, JSON.stringify(started));
  await shot('3-stage-1');

  await page.click('#pauseBtn');
  check(`${name}: pause shows the build, route and seed`, (await visible(page, 'pause')) && /Route: .+ > .+Seed TEST1/.test(await page.textContent('#pauseBuild')));
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
  const route1 = await page.evaluate(() => scene().route.map(e => e.id).join(','));
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
    const s = scene(), coins = s.coins;
    document.getElementById('rerollBtn').click();
    return { spent: coins - s.coins };
  });
  check(`${name}: reroll costs coins`, reroll.spent === 3, JSON.stringify(reroll));
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
    // Hold Vega's fire until a few enemies are on screen (otherwise a strong build shoots each one as it appears).
    const waitForEnemies = () => page.evaluate(() => {
      const s = scene(), onScreen = () => s.enemies.getChildren().filter(e => s.isOnScreen(e)).length;
      s.invulnUntil = Infinity;
      if (app.state === 'shop') document.querySelector('#shop [data-action=continue]').click(); // an earlier check cleared the stage
      for (let i = 0; i < 1200 && onScreen() < 3 && app.state === 'playing'; i++) {
        s.nextFire = s.nextCannon = s.nextAxe = s.nextBoomerang = s.t + 1000;
        __step(1);
      }
      s.nextFire = s.nextCannon = s.nextAxe = s.nextBoomerang = 0;
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
      const e = s.enemies.getChildren().find(x => s.isOnScreen(x));
      if (!e) return { still: false, why: 'no enemy on screen' };
      const at = [e.x, e.y];
      __step(60);
      return { still: e.active ? e.x === at[0] && e.y === at[1] : 'killed', shots: s.enemyShots.countActive() };
    });
    check(`${name}: Siren freezes enemies and clears their shots`, freeze.still !== false && freeze.shots === 0, JSON.stringify(freeze));

    // ----- The later timelines' gear -----
    const gear = await page.evaluate(() => {
      const s = scene();
      s.coins = 9999;
      for (const id of ['sixshooter', 'dynamite', 'shuriken', 'axes', 'boomerang', 'fire', 'berserk', 'hearth']) s.buy(UPGRADE[id]);
      const seen = { stars: 0, axe: false, boomerangBack: false, burning: false };
      s.invulnUntil = Infinity;
      for (let i = 0; i < 400 && app.state === 'playing'; i++) {
        __step(1);
        seen.stars = Math.max(seen.stars, s.stars.filter(st => st.visible).length);
        for (const b of s.bullets.getChildren()) {
          if (b.texture.key === 'axe') seen.axe = true;
          if (b.texture.key === 'boomerang' && b.returning) seen.boomerangBack = true;
        }
        if (s.enemies.getChildren().some(e => e.burnUntil > s.t)) seen.burning = true;
      }
      return seen;
    });
    check(`${name}: later timelines' gear works (stars orbit, axes fly, boomerangs come back, fire burns)`,
      gear.stars === 2 && gear.axe && gear.boomerangBack && gear.burning, JSON.stringify(gear));
    for (const id of ['stampede', 'blossom', 'thunder', 'meteor']) {
      const fired = await page.evaluate(i => {
        // The stars and dynamite bought above can clear a stage on their own, so wait for an enemy and fire in one go.
        const s = scene();
        for (let k = 0; k < 900 && !(app.state === 'playing' && s.enemies.getChildren().some(e => s.isOnScreen(e))); k++) {
          if (app.state === 'shop') document.querySelector('#shop [data-action=continue]').click();
          s.nextFire = s.nextCannon = s.nextAxe = s.nextBoomerang = s.t + 1000;
          __step(1);
        }
        s.nextFire = s.nextCannon = s.nextAxe = s.nextBoomerang = 0;
        s.buy(UPGRADE[i]);
        s.charge = s.chargeNeeded();
        const ok = s.useActive();
        __step(240);
        return { ok, item: s.P.active?.id, state: app.state };
      }, id);
      check(`${name}: ${id} active item fires`, fired.ok && fired.item === id, JSON.stringify(fired));
    }
    await shot('4c-new-gear');

    // Same seed: same first shop and same 5 timelines. (offers1/route1 came from seed TEST1 before buying anything.)
    const again = await firstShop(page, 'TEST1');
    const other = await firstShop(page, 'OTHER9');
    check(`${name}: same seed gives the same timelines and shop, a different seed doesn't`,
      again.offers === offers1 && again.route === route1 && (other.route !== route1 || other.offers !== offers1), JSON.stringify({ route1, again, other }));
    await page.click('#shop [data-action=continue]');

    const route = await page.evaluate(() => scene().route.map(e => ({ id: e.id, name: e.name.toUpperCase(), road: e.road, mid: e.mid.key, boss: e.boss.key })));
    for (const [stage, kind, key] of checkpointsFor(route)) {
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
        check(`${name}: stage ${stage} is a side-view ${kind} in ${key}`, JSON.stringify(v) === JSON.stringify(want), JSON.stringify(v));
        if (stage % 10 === 3 || stage === 8) await shot(`5-stage-${stage}-${kind}-${key}`);
      } else if (kind === 'top') {
        const v = await page.evaluate(n => {
          __bot(`scene().stage === ${n} && app.state === 'playing'`, 200);
          __step(30);
          return { view: scene().view, anim: scene().player.anims.currentAnim?.key, road: scene().road.visible, obstacles: window.__obstacles };
        }, stage);
        check(`${name}: back on foot for stage ${stage} (and obstacles showed up in the chase)`, v.view === 'top' && v.anim === 'walk' && v.road && v.obstacles >= 1, JSON.stringify(v));
      } else if (kind === 'timeline') {
        const next = await page.evaluate(n => {
          __bot(`scene().stage === ${n} && /STAGE ${n}\\b/.test(scene().lastBanner)`, 120);
          __step(30); // let the new road and the card fade in before the screenshot
          return { stage: scene().stage, card: scene().lastBanner, road: roadKey(), parts: scene().parts };
        }, stage);
        const parts = (stage - 1) / 10;
        check(`${name}: stage ${stage} jumps to ${key.name} with ${parts} part(s)`, next.card.includes(key.name) && next.road === key.road && next.parts === parts, JSON.stringify(next));
        await shot(`6-stage-${stage}-card`);
      } else {
        // Look for the boss arriving: by late stages the bot's build can kill it the moment it becomes hittable.
        const got = await page.evaluate(n => { __bot(`scene().stage === ${n} && scene().boss`, 400); return { stage: scene().stage, boss: scene().boss?.texture.key }; }, stage);
        check(`${name}: boss on stage ${stage} (${key})`, got.stage === stage && got.boss === key, JSON.stringify(got));
        await page.evaluate(() => { __step(140); scene().boss?.clearTint(); }); // let it fly in; no white hit-flash in the picture
        await shot(`5-boss-stage-${stage}`);
        if (stage === 5) {
          const hp = await page.evaluate(() => { scene().hp = 1; __bot(`app.state === 'shop'`, 60); return { hp: scene().hp, max: scene().P.maxHp }; });
          check(`${name}: mid-boss coffee heals fully`, hp.hp === hp.max, JSON.stringify(hp));
        }
      }
    }

    // Stage 50's boss drops the 5th part: then the choice. Go endless.
    const choice = await page.evaluate(() => { __bot(`app.state === 'choice'`, 200); return { state: app.state, parts: scene().parts }; });
    check(`${name}: after stage 50 the 5th part brings up the go-home-or-endless choice`, choice.state === 'choice' && choice.parts === 5 && (await visible(page, 'choice')), JSON.stringify(choice));
    await shot('7-choice');
    await page.click('#choice [data-action=endless]');
    const endless = await page.evaluate(() => {
      __bot(`scene().stage === 51 && /STAGE 51\\b/.test(scene().lastBanner)`, 120);
      const s = scene();
      return { stage: s.stage, endless: s.endless, era: s.E.id, picked: s.route.length, hud: s.hud.text.includes('ENDLESS'), card: s.lastBanner };
    });
    check(`${name}: endless continues to stage 51 in a seeded timeline`, endless.stage === 51 && endless.endless && endless.picked === 6 && endless.hud && endless.card.includes('STAGE 51'), JSON.stringify(endless));
    await shot('8-endless-51');
    const later = await page.evaluate(() => { __bot(`scene().stage === 61`, 400); return { stage: scene().stage, picked: scene().route.length, distinct: scene().route[5] !== scene().route[6] }; });
    check(`${name}: endless picks another timeline at stage 61`, later.stage === 61 && later.picked === 7 && later.distinct, JSON.stringify(later));
  }

  if (name === 'desktop') { // the other ending: after the 5th part, go home
    const home = await page.evaluate(() => {
      const s = scene();
      s.invulnUntil = Infinity;
      s.stage = FINAL_STAGE;
      s.parts = TIMELINES - 1;
      s.collect(s.drop('part', s.player.x, s.player.y));
      __step(200);
      return app.state;
    });
    check(`${name}: the 5th part brings up the choice`, home === 'choice' && (await visible(page, 'choice')), home);
    await page.click('#choice [data-action=home]');
    const won = await page.evaluate(() => { __step(400); return { state: app.state, title: document.getElementById('endTitle').textContent }; });
    check(`${name}: Return to 1986 ends the case`, won.state === 'won' && won.title === 'CASE CLOSED', JSON.stringify(won));
    await shot('7-won');
    await page.click('#end .primary');
    await page.evaluate(() => __step(5));
  }

  // Lose every life: game over screen
  await page.evaluate(() => {
    const s = scene();
    s.P.armor = 0;
    s.P.regen = 0;
    s.shield = 0;
    for (let i = 0; i < 100 && s.hp > 0; i++) { s.invulnUntil = 0; s.shield = 0; s.hitPlayer(); __step(10); }
    __step(90);
  });
  check(`${name}: game over screen`, (await visible(page, 'end')) && (await page.textContent('#endTitle')) === 'GAME OVER');
  await shot('9-game-over');
  await page.click('#end button:not(.primary)');
  check(`${name}: back to main menu`, await visible(page, 'main'));

  if (name === 'phone') { // sprite sheets: every texture at 2x, for checking the pixel art (two pages, it's a lot)
    const keys = await page.evaluate(() => Object.keys(ART).sort((a, b) => b.startsWith('vega') - a.startsWith('vega')).filter(k => !/^ride.*1$/.test(k)));
    for (const [i, part] of [keys.slice(0, Math.ceil(keys.length / 2)), keys.slice(Math.ceil(keys.length / 2))].entries()) {
      await page.evaluate(list => {
        document.getElementById('sheet')?.remove();
        const sheet = document.createElement('div');
        sheet.id = 'sheet';
        sheet.style.cssText = 'position:fixed;inset:0;z-index:9;background:#140a26;display:flex;flex-wrap:wrap;gap:10px;padding:10px;align-content:flex-start;overflow:hidden';
        for (const key of list) {
          const img = new Image();
          img.onload = () => { img.width = img.naturalWidth * (img.naturalWidth > 80 ? 1 : 2); };
          img.style.imageRendering = 'pixelated';
          img.src = game.textures.getBase64(key);
          sheet.append(img);
        }
        document.body.append(sheet);
      }, part);
      await page.waitForTimeout(300);
      await shot(`10-sprites-${i + 1}`);
    }
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
