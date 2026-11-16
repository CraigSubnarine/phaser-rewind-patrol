// Headless playtest for Rewind Patrol: drives the real page in Chromium on a phone and a desktop screen,
// checks the main flows, saves screenshots to playtest-output/ and exits 1 on any failure or page error.
// Run from this game's folder: node tools/playtest.js   (needs the playwright or playwright-core package + its Chromium)
const path = require('path');
const fs = require('fs');
const { chromium } = (() => { try { return require('playwright'); } catch { return require('playwright-core'); } })();
const { serve } = require('./server');

let url; // the game, served over http like GitHub Pages does (set when the server starts)
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
    for (let k = 0; k < 40; k++) {
      const el = document.querySelector('#shopItems .card:not(:disabled)');
      if (!el) break;
      el.click();
    }
    document.querySelector('#shop [data-action=continue]').click();
  };
  // Empty the backpack (as if everything in it were sold), so a check can buy into it.
  window.__emptyPack = s => {
    for (const id of Object.keys(s.pack)) { delete s.owned[id]; delete s.spent[id]; }
    s.pack = {};
    s.bought = s.bought.filter(id => UPGRADE[id].active);
    s.refreshStats();
  };
  // Which mini-boss levels of a seed lead into a bonus level (mirrors Play.rollBonus: one roll per timeline).
  window.bonusPlan = (seed, n) => {
    const r = new Phaser.Math.RandomDataGenerator([`${seed}/bonus`]);
    return Array.from({ length: n }, () => r.frac() < BONUS_CHANCE);
  };
  // Every soldier spawned (wave, type, and whether its health is the run's toughness x its type's multiplier).
  window.__spawned = [];
  const spawn = Play.prototype.spawnEnemy;
  Play.prototype.spawnEnemy = function (x, y, role, props) {
    const e = spawn.call(this, x, y, role, props);
    if (window.__spawnLog !== false) __spawned.push({ stage: this.stage, role, ok: Math.abs(e.hp - this.enemyHp() * ROLES[role].hp) < 1e-9 });
    return e;
  };
  // The first seed PREFIX1, PREFIX2... whose bonus plan passes the test.
  window.findSeed = (prefix, n, ok) => { for (let i = 1; ; i++) if (ok(bonusPlan(prefix + i, n))) return prefix + i; };
  window.__bot = (expr, maxSeconds) => {
    const until = new Function(`return ${expr}`);
    for (let f = 0; f < maxSeconds * 60 && !until(); f++) {
      if (app.state === 'shop') { __shopBot(); continue; }
      if (app.state !== 'playing') break; // choice screen, game over...
      const s = scene();
      s.invulnUntil = Infinity;
      if (s.bonus) {
        // Bonus levels last 45 s; after 6 s of one we've seen it work, so end it early to keep the run quick.
        if (s.bonus.endsAt !== Infinity && s.t > s.bonus.endsAt - BONUS_TIME + 6000) s.bonus.endsAt = s.t;
      }
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

// Every checkpoint of a 50-wave run, from the run's own route (the seed picks 5 timelines out of 11) and bonus plan:
// each level's boss, what follows it (the mid-boss: the seed's bonus chase, or straight to the shop; the
// timeline boss: always straight to the shop), and the time jumps.
const BACKPACK_ROWS = 3; // the backpack's starting rows (BACKPACK.rows in data.js)
const checkpointsFor = (route, plan) => route.flatMap((era, i) => [
  [i * 10 + 5, 'boss', era.mid],
  [i * 10 + 5, plan[i] ? 'chase' : 'noBonus', era.id],
  ...(i === 0 ? [[6, 'top']] : []),
  [i * 10 + 10, 'boss', era.boss],
  [i * 10 + 10, 'noBonus', era.id],
  ...(i < 4 ? [[i * 10 + 11, 'timeline', route[i + 1]]] : []),
]);

// Start a fresh run from the main menu with a given seed.
async function startRun(page, seed) {
  await page.evaluate(() => toMenu());
  await page.evaluate(() => __step(3));
  await page.click('#main .primary');
  await page.fill('#seedInput', seed);
  await page.click('#story .primary');
  await page.evaluate(() => { __step(2); scene().tweens.getDelta = () => 1000 / 60; });
}

// Start a run with a given seed and play until the first shop; returns its offers and route.
async function firstShop(page, seed) {
  await startRun(page, seed);
  await page.evaluate(() => __bot(`app.state === 'shop'`, 200));
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
  const seed1 = await page.evaluate(() => findSeed('TEST', 1, p => p[0])); // its first mini-boss leads into a bonus level
  check(`${name}: main menu on load`, await visible(page, 'main'));
  await shot('1-menu');

  await page.click('#main .primary');
  check(`${name}: Play opens the story with a seed`, (await visible(page, 'story')) && (await page.inputValue('#seedInput')).length === 6);
  await page.fill('#seedInput', seed1);
  await page.click('#story .primary');
  await page.evaluate(() => __step(60 * 2)); // time jump, then the first level card
  const card = await page.evaluate(() => ({ card: scene().lastBanner, era: scene().E.name.toUpperCase(), year: scene().E.year, route: scene().route.length }));
  check(`${name}: level card shows the timeline the seed picked`, card.card.includes(card.era) && card.card.includes(card.year) && /LEVEL 1\b/.test(card.card) && /WAVES 1-5/.test(card.card) && card.route === 5, JSON.stringify(card));
  await shot('2-stage-card');
  await page.evaluate(() => __step(60 * 3));
  const started = await page.evaluate(() => ({ state: app.state, stage: scene().stage, seed: app.seed, enemies: scene().enemies.countActive(), road: roadKey(), want: scene().E.road, hp: scene().hp }));
  check(`${name}: wave 1 starts on that timeline's road with seed ${seed1}`,
    started.state === 'playing' && started.stage === 1 && started.enemies > 0 && started.road === started.want && started.seed === seed1 && started.hp === 3, JSON.stringify(started));
  await shot('3-stage-1');

  await page.click('#pauseBtn');
  check(`${name}: pause shows the build, route and seed`, (await visible(page, 'pause')) && new RegExp(`Route: .+ > .+Seed ${seed1}`).test(await page.textContent('#pauseBuild')));
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
    // Coins are rare: about 1 defeated enemy in 5 drops one.
    const rate = await page.evaluate(() => {
      const s = scene(), drop = s.drop, seen = { coin: 0, donut: 0 }, n = 500;
      const kill = role => s.killEnemy(s.spawnEnemy(-300, -300, role, { mode: 'stream', age: 0, side: 1, phase: 0 }), true);
      window.__spawnLog = false;
      s.drop = function (type, x, y) { seen[type] = (seen[type] || 0) + 1; return drop.call(this, type, x, y); };
      for (let i = 0; i < n; i++) kill('G');
      const grunts = { coin: seen.coin / n, donut: seen.donut / n };
      seen.coin = 0;
      for (let i = 0; i < 20; i++) kill('H');
      s.drop = drop;
      window.__spawnLog = true;
      for (const p of s.pickups.getChildren().slice()) if (p.x < -100) p.destroy();
      return { ...grunts, heavyCoins: seen.coin };
    });
    check(`${name}: about 1 enemy in 5 drops a coin (heavies always do)`, rate.coin > 0.1 && rate.coin < 0.3 && rate.donut < 0.08 && rate.heavyCoins === 20, JSON.stringify(rate));

    // The four soldier types: their own sprite and health, sharpshooters aim, chargers charge, health bars show.
    const roles = await page.evaluate(() => {
      const s = scene(), hold = () => { s.nextFire = s.nextCannon = s.nextAxe = s.nextBoomerang = s.t + 100000; };
      const at = (role, x, y) => s.spawnEnemy(x, y, role, { mode: 'formation', homeX: x, homeY: y, fromX: x, fromY: y, enter: 1 });
      window.__spawnLog = false;
      s.invulnUntil = Infinity;
      hold();
      const hp = Object.fromEntries(Object.keys(ROLES).map(k => {
        const e = at(k, -300, -300), ok = e.hp === s.enemyHp() * ROLES[k].hp && e.texture.key === s.E.army[k];
        e.destroy();
        return [k, ok ? e.hp : 'wrong'];
      }));
      // Sharpshooter: once it has aimed, a faster shot straight at Vega.
      s.placePlayer(480, H - 110);
      const sn = at('S', 150, 200), shoot = s.shoot;
      let snipe = null;
      s.shoot = function (x, y, tex, speed, angle) {
        if (!snipe && Math.abs(x - sn.x) < 1) snipe = { aimed: Math.abs(angle - this.angleToPlayer(x, y)) < 0.01, fast: speed > this.diff.shotSpeed };
        return shoot.apply(this, arguments);
      };
      sn.setTint(0xff5050).snipeAt = s.et + 450;
      for (let i = 0; i < 60 && !snipe; i++) { hold(); __step(1); }
      s.shoot = shoot;
      sn.destroy();
      // Charger: shakes, then runs down at Vega. (Wave 1 is all grunts, so it's the only charger around.)
      const ch = at('C', 300, 150);
      s.nextCharge = 0;
      let wound = false;
      for (let i = 0; i < 90 && ch.mode !== 'dive'; i++) { hold(); __step(1); wound ||= ch.windup > 0; }
      const charge = { wound, mode: ch.mode, down: ch.vy > 0, toward: Math.sign(ch.vx) === Math.sign(s.player.x - ch.x) };
      ch.destroy();
      // Heavy: a health bar once it's been hit.
      const hv = at('H', 300, 300);
      s.damage(hv, 1, false);
      hold();
      __step(1);
      const bar = s.hpBars.commandBuffer.length > 0 && hv.hp < hv.maxHp;
      hv.destroy();
      s.placePlayer(W / 2, H - 110);
      s.nextFire = s.nextCannon = s.nextAxe = s.nextBoomerang = 0;
      s.invulnUntil = 0;
      window.__spawnLog = true;
      return { hp, snipe, charge, bar };
    });
    check(`${name}: soldier types have their own health (charger < sharpshooter < grunt < heavy)`,
      roles.hp.C < roles.hp.S && roles.hp.S < roles.hp.G && roles.hp.G < roles.hp.H, JSON.stringify(roles.hp));
    check(`${name}: sharpshooters fire a fast shot aimed straight at Vega`, roles.snipe?.aimed && roles.snipe?.fast, JSON.stringify(roles.snipe));
    check(`${name}: chargers shake, then run down at Vega`, roles.charge.wound && roles.charge.mode === 'dive' && roles.charge.down && roles.charge.toward, JSON.stringify(roles.charge));
    check(`${name}: a hit heavy shows a health bar`, roles.bar);
    // The Caribbean pier is wide enough that Vega (x 35-565) and the pirates never walk on the water.
    const pier = await page.evaluate(() => {
      const wood = x => { const c = game.textures.getPixel(x, 5, 'road-caribbean'); return c.red > c.blue; };
      return { inside: [36, 120, 300, 480, 564].every(wood), sea: !wood(8) && !wood(592) };
    });
    check(`${name}: the Caribbean pier spans the whole walkway, with water only at the edges`, pier.inside && pier.sea, JSON.stringify(pier));
    await page.evaluate(() => { const s = scene(); s.road.setTexture('road-caribbean'); s.placePlayer(40, H - 110); __step(2); });
    await shot('3a-caribbean-pier');
    await page.evaluate(() => { const s = scene(); s.road.setTexture(s.E.road); s.placePlayer(W / 2, H - 110); });
  }

  // ----- A level: 5 waves back to back, then a bonus level, then the shop -----
  const wave2 = await page.evaluate(() => {
    __bot(`scene().stage === 2`, 120);
    return { state: app.state, shopShown: !document.getElementById('shop').hidden, call: scene().lastBanner };
  });
  check(`${name}: waves run back to back (no shop between waves)`, wave2.state === 'playing' && !wave2.shopShown && /WAVE 2/.test(wave2.call), JSON.stringify(wave2));
  const bonus = await page.evaluate(() => {
    __bot(`scene().bonus && scene().bonus.endsAt !== Infinity`, 200);
    const s = scene(), hp = s.hp;
    s.coins = Math.max(s.coins, 10);
    const coins = s.coins;
    s.invulnUntil = 0;
    s.hitPlayer(); // bonus levels: a hit costs coins, never HP
    return { stage: s.stage, view: s.view, hpSame: s.hp === hp, lostCoins: coins - s.coins, hud: s.hud.text.includes('BONUS') };
  });
  check(`${name}: after the wave-5 mid-boss, seed ${seed1} rolls a bonus chase, where hits cost coins not HP`,
    bonus.stage === 5 && bonus.view === 'side' && bonus.hpSame && bonus.lostCoins > 0 && bonus.hud, JSON.stringify(bonus));
  await page.evaluate(() => __step(60));
  await shot('3b-bonus-chase');
  const coinsBefore = await page.evaluate(() => { __bot(`app.state === 'shop'`, 120); return scene().coins; });
  check(`${name}: the bonus level ends with a payout, then the shop`, (await visible(page, 'shop')) && coinsBefore > 0 && /BONUS COMPLETE/.test(await page.evaluate(() => scene().lastBanner)), `$${Math.floor(coinsBefore)}`);
  const spawned = await page.evaluate(() => {
    const by = {};
    for (const r of __spawned) if (r.stage <= 4) (by[r.stage] ||= new Set()).add(r.role);
    return { roles: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, [...v].sort().join('')])), hpOk: __spawned.every(r => r.ok) };
  });
  check(`${name}: level 1 brings in a new soldier type each wave (grunts, chargers, sharpshooters, heavies)`,
    JSON.stringify(spawned.roles) === JSON.stringify({ 1: 'G', 2: 'CG', 3: 'CGS', 4: 'CGHS' }) && spawned.hpOk, JSON.stringify(spawned));
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
  check(`${name}: after the shop, level 2 starts at wave 6`, await page.evaluate(() => { __step(60 * 3); return app.state === 'playing' && scene().stage === 6 && /LEVEL 2\b/.test(scene().lastBanner); }));

  if (name === 'phone') {
    const combo = await page.evaluate(() => {
      const s = scene();
      s.coins = 500;
      __emptyPack(s);
      const unlocked = [s.buy(UPGRADE.pilum), s.buy(UPGRADE.longbow)].flat().map(c => c.id);
      return { unlocked, longbowEvery: s.P.longbowEvery, pierce: s.P.pierce };
    });
    check(`${name}: Pilum + Longbow unlocks the Volley Fire combo`, combo.unlocked.includes('volley') && combo.longbowEvery === 2 && combo.pierce >= 1, JSON.stringify(combo));

    // ----- Active items -----
    // Hold Vega's fire until a few enemies are on screen (otherwise a strong build shoots each one as it appears).
    // A boss wave has no regular enemies, so a boss gets knocked out on the spot.
    const waitForEnemies = () => page.evaluate(() => {
      const s = scene(), onScreen = () => s.enemies.getChildren().filter(e => s.isOnScreen(e)).length;
      s.invulnUntil = Infinity;
      for (let i = 0; i < 1500 && onScreen() < 3; i++) {
        if (app.state === 'shop') document.querySelector('#shop [data-action=continue]').click(); // an earlier check ended the level
        if (s.boss?.ready) s.damage(s.boss, 1e6, true);
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
      s.stage = 5; // pretend it's a boss wave
      const refused = s.useActive() === false;
      s.stage = stage;
      s.bonus = { caught: 0, endsAt: Infinity }; // ...and a bonus level
      const refusedBonus = s.useActive() === false;
      s.bonus = null;
      return { swapped, refused, refusedBonus };
    });
    await waitForEnemies();
    const skipped = await page.evaluate(() => {
      const s = scene(), from = s.stage;
      s.charge = s.chargeNeeded();
      const fired = s.useActive();
      __step(100);
      return { fired, state: app.state, from, to: s.stage };
    });
    check(`${name}: VCR Remote replaces the old item, refuses boss waves and bonus levels, skips a wave`,
      skip.swapped && skip.refused && skip.refusedBonus && skipped.fired && skipped.state === 'playing' && skipped.to === skipped.from + 1, JSON.stringify({ skip, skipped }));

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
      const s = scene(), seen = { stars: 0, axe: false, boomerangBack: false, burning: false };
      s.coins = 9999;
      __emptyPack(s);
      for (const id of ['sixshooter', 'fire', 'berserk', 'shuriken', 'hearth', 'axes']) s.buy(UPGRADE[id]);
      // Weak early enemies die from the hit that sets them alight, so watch for hits igniting things instead.
      const ignite = s.ignite;
      s.ignite = function (target) { seen.burning = true; return ignite.call(this, target); };
      const play = frames => {
        for (let i = 0; i < frames; i++) {
          if (app.state === 'shop') document.querySelector('#shop [data-action=continue]').click();
          s.invulnUntil = Infinity;
          __step(1);
          seen.stars = Math.max(seen.stars, s.stars.filter(st => st.visible).length);
          for (const b of s.bullets.getChildren()) {
            if (b.texture.key.startsWith('axe~')) seen.axe = true; // (shots use glowing copies of their sprite: axe~4ff0ff)
            if (b.texture.key.startsWith('boomerang~') && b.returning) seen.boomerangBack = true;
          }
          if ([...s.enemies.getChildren(), s.boss].some(e => e?.burnUntil > s.t)) seen.burning = true;
        }
      };
      play(300);
      // Sell the axes (half their price back), and the boomerang fits where they were.
      const coins = s.coins, spent = s.spent.axes;
      s.sell('axes');
      const refund = s.coins - coins;
      s.buy(UPGRADE.boomerang);
      seen.swap = { axesGone: !s.owned.axes && !s.pack.axes, refund, want: Math.floor(spent / 2), boomerang: !!s.pack.boomerang };
      play(300);
      s.ignite = ignite;
      return seen;
    });
    check(`${name}: later timelines' gear works (stars orbit, axes fly, boomerangs come back, fire burns)`,
      gear.stars === 2 && gear.axe && gear.boomerangBack && gear.burning, JSON.stringify(gear));
    check(`${name}: selling the axes gives half back and frees their place for the boomerang`,
      gear.swap.axesGone && gear.swap.refund === gear.swap.want && gear.swap.want > 0 && gear.swap.boomerang, JSON.stringify(gear.swap));
    for (const id of ['stampede', 'blossom', 'thunder', 'meteor']) {
      const fired = await page.evaluate(i => {
        // The stars and dynamite bought above can clear a stage on their own, so wait for an enemy and fire in one go.
        const s = scene();
        for (let k = 0; k < 1500 && !(app.state === 'playing' && s.enemies.getChildren().some(e => s.isOnScreen(e))); k++) {
          if (app.state === 'shop') document.querySelector('#shop [data-action=continue]').click();
          if (s.boss?.ready) s.damage(s.boss, 1e6, true); // boss waves have no regular enemies
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

    // ----- The future timelines' gear -----
    const future = await page.evaluate(() => {
      const s = scene(), made = [], blasts = [], spawn = s.spawnBullet, explode = s.explode;
      s.coins = 99999;
      __emptyPack(s);
      for (const id of ['smart', 'drone', 'molotov', 'scavenger', 'deflector']) s.buy(UPGRADE[id]);
      s.spawnBullet = function (x, y, tex, angle, o) {
        made.push({ tex, home: o.home ?? 0, drone: s.drones.some(d => d.x === x && d.y === y) });
        return spawn.apply(this, arguments);
      };
      s.explode = function (x, y, r, dmg, cannon, burns) { blasts.push({ r, burns: !!burns }); return explode.apply(this, arguments); };
      // Smart Rounds: a shot fired straight up curves towards an enemy off to the right (the only one in play for now).
      const others = s.enemies.getChildren().slice();
      others.forEach(o => o.setActive(false));
      const e = s.spawnEnemy(520, 300, 'H', { mode: 'formation', homeX: 520, homeY: 300, fromX: 520, fromY: 300, enter: 1 });
      const b = spawn.call(s, 80, 800, 'laser', -Math.PI / 2, { dmg: 0, pierce: 0, bounce: 0, home: s.P.homing });
      for (let i = 0; i < 20; i++) { s.invulnUntil = Infinity; s.nextFire = s.nextDrone = s.nextMolotov = s.nextDrill = s.nextTorpedo = s.t + 1000; __step(1); }
      const curved = b.active && b.body.velocity.x > 50;
      b.destroy();
      e.destroy();
      others.forEach(o => o.scene && o.setActive(true)); // (skip any that left the screen meanwhile)
      const play = frames => {
        for (let i = 0; i < frames; i++) {
          if (app.state === 'shop') document.querySelector('#shop [data-action=continue]').click();
          s.invulnUntil = Infinity;
          __step(1);
        }
      };
      const has = t => made.some(m => m.tex === t), combos = () => ['firebomb', 'torpedobay', 'droneswarm'].filter(id => s.combos.some(c => c.id === id)).join(',');
      play(400);
      // Molotovs fly straight and only burst when they hit something, so give one a while to find a target.
      for (let i = 0; i < 900 && !blasts.some(x => x.burns); i++) play(1);
      const r = { curved, drones: s.drones.length, droneShot: made.some(m => m.drone), molotov: has('molotov'), fireBlast: blasts.some(x => x.burns) };
      s.sell('molotov'); // swap the Molotov for the drill
      s.buy(UPGRADE.drill);
      play(200);
      r.drill = has('drillbolt');
      s.sell('drill'); // ...and the drill for the torpedo
      s.buy(UPGRADE.torpedo);
      play(300);
      r.torpedo = made.some(m => m.tex === 'torpedo' && m.home > 0);
      r.combos1 = combos(); // Torpedo Bay (torpedo + Smart Rounds), Drone Swarm (drone + Smart Rounds)
      s.sell('torpedo'); // sell the torpedo and Smart Rounds, buy the Molotov and Fire: Firebomb on, the other two off
      s.sell('smart');
      s.buy(UPGRADE.molotov);
      s.buy(UPGRADE.fire);
      r.combos2 = combos();
      s.spawnBullet = spawn;
      s.explode = explode;
      return { ...r, coinChance: s.P.coinChance, shield: s.shield >= 1 };
    });
    check(`${name}: future gear works (homing shots, drone, Molotov flames, drill bolts, homing torpedoes, Scavenger, Deflector)`,
      future.curved && future.drones === 1 && future.droneShot && future.molotov && future.fireBlast && future.drill && future.torpedo && future.coinChance === 2 && future.shield,
      JSON.stringify(future));
    check(`${name}: combos come and go with their halves (Torpedo Bay + Drone Swarm, then Firebomb)`,
      future.combos1 === 'torpedobay,droneswarm' && future.combos2 === 'firebomb', JSON.stringify({ combos1: future.combos1, combos2: future.combos2 }));
    await shot('4d-future-gear');
    const o2 = await page.evaluate(() => { // O2 Tank at level 3: the next wave cleared heals 1
      const s = scene(), wc = s.waveCleared;
      let healed = null;
      s.coins = 9999;
      __emptyPack(s);
      for (let i = 0; i < 3; i++) s.buy(UPGRADE.o2tank);
      s.waveCleared = function () { const before = this.hp; wc.call(this); healed = window.__healed = { before, after: this.hp }; };
      s.hp = 1;
      window.__healed = null;
      __bot('window.__healed', 120); // the bot aims (Vega's backpack was just emptied, so he wouldn't clear a wave alone)
      s.waveCleared = wc;
      return healed;
    });
    check(`${name}: O2 Tank heals 1 after a wave`, o2 && o2.after === o2.before + 1, JSON.stringify(o2));
    for (const id of ['emp', 'nitro', 'orbital', 'blackhole']) {
      const r = await page.evaluate(i => {
        const s = scene(), hold = () => {
          s.invulnUntil = Infinity;
          for (const k of ['nextFire', 'nextCannon', 'nextAxe', 'nextBoomerang', 'nextDrone', 'nextMolotov', 'nextDrill', 'nextTorpedo']) s[k] = s.t + 1000;
        };
        const onScreen = () => s.enemies.getChildren().filter(e => s.isOnScreen(e));
        for (let k = 0; k < 2000 && !(app.state === 'playing' && onScreen().length >= 2); k++) {
          if (app.state === 'shop') document.querySelector('#shop [data-action=continue]').click();
          if (s.boss?.ready) s.damage(s.boss, 1e6, true); // boss waves have no regular enemies
          hold();
          __step(1);
        }
        const foes = onScreen();
        s.buy(UPGRADE[i]);
        s.charge = s.chargeNeeded();
        const r = { ok: s.useActive(), item: s.P.active?.id, foes: foes.length };
        const hurt = () => foes.some(e => !e.active || e.hp < e.maxHp);
        if (i === 'emp') Object.assign(r, { frozen: s.frozenUntil > s.t, shots: s.enemyShots.countActive(), hurt: hurt() });
        if (i === 'nitro') Object.assign(r, { fast: s.fireDelay() < s.P.fireDelay / 2.5, speed: s.moveSpeed() === 2 * s.P.moveSpeed });
        if (i === 'blackhole') r.pulled = foes.filter(e => e.mode === 'pulled').length;
        for (let k = 0; k < 30; k++) { hold(); __step(1); }
        if (i === 'orbital') r.hurt = hurt();
        for (let k = 0; k < 120; k++) { hold(); __step(1); }
        if (i === 'blackhole') r.stuck = s.enemies.getChildren().filter(e => e.mode === 'pulled').length;
        return r;
      }, id);
      const effect = { emp: r.frozen && r.shots === 0 && r.hurt, nitro: r.fast && r.speed, orbital: r.hurt, blackhole: r.pulled >= 2 && r.stuck === 0 }[id];
      check(`${name}: ${id} active item fires and works`, r.ok && r.item === id && r.foes >= 2 && effect, JSON.stringify(r));
    }

    // ----- The backpack: merging to tier III, packing shapes, two companions at most, smoother toughness -----
    const levels = await page.evaluate(() => {
      const s = scene();
      s.coins = 9999;
      __emptyPack(s);
      const bought = [1, 2, 3, 4].map(() => !!s.buy(UPGRADE.rapid));
      s.buy(UPGRADE.partner);
      s.buy(UPGRADE.drone);
      const third = s.buyKind({ ...UPGRADE.partner, id: 'thirdpal' });
      const tough = [1, 5, 6, 11, 46, 51].map(n => { const st = s.stage; s.stage = n; const v = s.enemyHp(); s.stage = st; return v; });
      const P = shapes => shapes.map((sh, i) => ({ id: `p${i}`, cells: cellsOf(SHAPES[sh]) }));
      const packing = [pack(P(Array(12).fill('one')), 4, 3), !pack(P(Array(13).fill('one')), 4, 3), !pack(P(['big', 'big', 'big']), 4, 3),
        pack(P(['big', 'big', 'wide', 'wide']), 4, 3), pack(P(['long', 'long', 'long', 'long']), 4, 3), pack(P(['ell', 'ell', 'ell', 'ell']), 4, 3)].map(Boolean);
      return { bought, tier: s.owned.rapid, offered: s.rollOffers().some(u => u.id === 'rapid'), third, tough, packing };
    });
    check(`${name}: buying again merges an item up to tier III, then the shop stops offering it`,
      JSON.stringify(levels.bought) === '[true,true,true,false]' && levels.tier === 3 && !levels.offered, JSON.stringify(levels));
    check(`${name}: pieces pack into the backpack by shape (12 1x1 fit 4x3, 13 don't, 3 2x2 don't, 4 L-shapes do...)`, levels.packing.every(Boolean), JSON.stringify(levels.packing));
    check(`${name}: at most two companions`, levels.third === 'companions', levels.third);
    check(`${name}: soldier toughness rises 0.25 every level of 5 waves`, JSON.stringify(levels.tough) === '[1,1,1.25,1.5,3.25,3.5]', JSON.stringify(levels.tough));
    const packUi = await page.evaluate(() => {
      const s = scene();
      s.coins = 9999;
      __emptyPack(s);
      s.packRows = 3;
      s.buy(UPGRADE.vest);
      s.buy(UPGRADE.cannon); // two 2x2 pieces: 8 of the 12 cells, leaving a 1x4 strip
      openShop(s);
      app.shop.offers = [UPGRADE.longbow, UPGRADE.scutum, UPGRADE.vest, UPGRADE.lucky];
      renderShop();
      const card = i => document.querySelector(`#shopItems [data-buy="${i}"]`);
      card(0).click(); // the 1x3 Longbow goes in the strip, turned on its side; a 2x2 Scutum can't fit any more
      const r = { cells: document.querySelectorAll('#shopLoadout .cell').length, pieces: document.querySelectorAll('#shopLoadout .piece').length,
        scutum: { off: card(1).disabled, says: card(1).querySelector('.combo')?.textContent }, vest: card(2).querySelector('.combo')?.textContent };
      document.querySelector('#shopLoadout [data-piece="cannon"]').click();
      r.sellText = document.getElementById('sellBtn').textContent;
      return r;
    });
    await shot('4e-backpack');
    const sold = await page.evaluate(() => {
      const s = scene(), coins = s.coins;
      document.getElementById('sellBtn').click();
      return { refund: s.coins - coins, cannonGone: !s.pack.cannon, scutumNow: !document.querySelector('#shopItems [data-buy="1"]').disabled };
    });
    // Arranging by hand, with a real pointer: drag the vest into the cannon's old place, then tap the longbow and turn it.
    const cellAt = (x, y) => page.evaluate(([x, y]) => {
      const b = document.querySelector('#shopLoadout .backpack');
      b.scrollIntoView({ block: 'center' });
      const r = b.getBoundingClientRect();
      return [r.left + (x + 0.5) * r.width / BACKPACK.w, r.top + (y + 0.5) * r.height / scene().packRows];
    }, [x, y]);
    const vestAt = await page.evaluate(() => scene().pack.vest[0]);
    const [ax, ay] = await cellAt(...vestAt), [bx, by] = await cellAt(2, 0);
    await page.mouse.move(ax, ay);
    await page.mouse.down();
    await page.mouse.move(bx, by, { steps: 6 });
    await page.mouse.up();
    const bowAt = await page.evaluate(() => scene().pack.longbow[0]);
    const [lx, ly] = await cellAt(...bowAt);
    await page.mouse.click(lx, ly);
    const arranged = await page.evaluate(() => {
      const s = scene(), picked = app.shop.picked, before = JSON.stringify(s.pack.longbow);
      document.getElementById('turnBtn').click();
      const bow = s.pack.longbow, r = { vest: s.pack.vest[0], picked, turned: before !== JSON.stringify(bow) && new Set(bow.map(c => c[0])).size === 1 };
      s.sys.resume(); // back to the wave (closing the shop the normal way would start the next stage)
      app.state = 'playing';
      showScreen(null);
      document.getElementById('pauseBtn').hidden = false;
      return r;
    });
    check(`${name}: drag a piece to move it, tap one and Turn it`, JSON.stringify(arranged.vest) === '[2,0]' && arranged.picked === 'longbow' && arranged.turned, JSON.stringify(arranged));
    check(`${name}: the backpack: pieces fill it, one that won't fit says "no room", owned items merge, tap a piece to sell it`,
      packUi.cells === 12 && packUi.pieces === 3 && packUi.scutum.off && /No room/.test(packUi.scutum.says) && /Merges into tier II/.test(packUi.vest)
        && /Sell Ship's Cannon I for \$9/.test(packUi.sellText) && sold.refund === 9 && sold.cannonGone && sold.scutumNow, JSON.stringify({ packUi, sold }));

    // Same seed: same first shop and same 5 timelines. (offers1/route1 came from seed1 before buying anything.)
    const again = await firstShop(page, seed1);
    const other = await firstShop(page, 'OTHER9');
    check(`${name}: same seed gives the same timelines and shop, a different seed doesn't`,
      again.offers === offers1 && again.route === route1 && (other.route !== route1 || other.offers !== offers1), JSON.stringify({ route1, again, other }));
    // ----- Every boss: idle animation, each phase's taunt and hurt pose, and every one of its attacks -----
    await startRun(page, 'BOSSES');
    await page.evaluate(() => { // let wave 1 start, then clear it away so the bosses have the screen to themselves
      const s = scene();
      for (let f = 0; f < 600 && !s.waveActive; f++) { s.invulnUntil = Infinity; __step(1); }
      s.streamTimers.forEach(t => t.remove());
      s.enemies.clear(true, true);
      Object.assign(s, { waveActive: false, spawnsLeft: 0 });
    });
    const bossList = await page.evaluate(() => ERAS.flatMap((e, i) => [[i, false], [i, true]]));
    for (const [i, main] of bossList) {
      const r = await page.evaluate(([i, main]) => {
        const s = scene(), hold = () => { s.nextFire = s.nextCannon = s.nextAxe = s.nextBoomerang = s.t + 1e6; s.invulnUntil = Infinity; };
        s.E = ERAS[i];
        hold();
        s.spawnBoss(main);
        const b = s.boss, cfg = b.cfg, seen = { taunts: [], phases: [], attacks: {}, hurt: true };
        for (let f = 0; f < 200 && !b.ready; f++) { hold(); __step(1); }
        b.nextAttack = Infinity; // only the attacks we fire below
        seen.taunts.push(s.lastTaunt);
        const frames = new Set();
        for (let f = 0; f < 60; f++) { hold(); __step(1); frames.add(b.texture.key); }
        seen.idle = frames.has(`${cfg.key}0`) && frames.has(`${cfg.key}1`);
        for (let ph = 0; ph < cfg.phases.length; ph++) {
          if (ph > 0) { // knock it just past the next threshold
            b.hp = b.maxHp * (1 - ph / cfg.phases.length) - 0.01;
            hold();
            __step(2);
            b.nextAttack = Infinity;
            seen.phases.push(b.phase);
            seen.taunts.push(s.lastTaunt);
            seen.hurt &&= b.texture.key === `${cfg.key}Hurt`;
          }
          for (const spec of cfg.phases[ph]) {
            const [name, arg] = spec.split(':');
            s.clearShots();
            s.enemies.clear(true, true);
            s.bossAttack(b, name, arg);
            const got = { shots: 0, hazards: 0, soldiers: 0, lowest: b.y };
            for (let f = 0; f < 150; f++) {
              hold();
              __step(1);
              got.shots = Math.max(got.shots, s.enemyShots.countActive());
              got.hazards = Math.max(got.hazards, s.hazards.length);
              got.soldiers = Math.max(got.soldiers, s.enemies.countActive());
              got.lowest = Math.max(got.lowest, b.y);
            }
            seen.attacks[spec] = name === 'lanes' ? got.hazards > 0 : name === 'charge' ? got.lowest > 400
              : name === 'summon' ? got.soldiers > 0 : got.shots > 0;
          }
        }
        return { key: cfg.key, ...seen, wantTaunts: cfg.taunts, n: cfg.phases.length };
      }, [i, main]);
      const attacksOk = Object.values(r.attacks).every(Boolean);
      check(`${name}: ${r.key}: idle animation, ${r.n} phases with their taunts and hurt pose, every attack works`,
        r.idle && r.hurt && JSON.stringify(r.phases) === JSON.stringify([...Array(r.n).keys()].slice(1)) && JSON.stringify(r.taunts) === JSON.stringify(r.wantTaunts) && attacksOk,
        attacksOk ? JSON.stringify({ phases: r.phases, idle: r.idle, hurt: r.hurt }) : JSON.stringify(r.attacks));
      await page.evaluate(() => { // one more attack of its last phase, caught mid-flight for the screenshot
        const s = scene(), b = s.boss, [name, arg] = b.cfg.phases[b.cfg.phases.length - 1][0].split(':');
        s.clearShots();
        s.bossAttack(b, name, arg);
        for (let f = 0; f < 45; f++) { s.nextFire = s.t + 1e6; s.invulnUntil = Infinity; __step(1); }
      });
      await shot(`5b-boss-${r.key}`);
      await page.evaluate(() => {
        const s = scene(), b = s.boss;
        s.bossColliders.forEach(c => c.destroy());
        s.bossBar.destroy();
        s.tweens.killTweensOf(b);
        b.destroy();
        s.boss = null;
        s.clearShots();
        s.enemies.clear(true, true);
      });
    }

    // ----- Every timeline: its road and army, then its bonus chase: its ride, riders, obstacles and scenery -----
    const eraIds = await page.evaluate(() => ERAS.map(e => e.id));
    for (const id of eraIds) {
      const top = await page.evaluate(id => {
        const s = scene(), E = s.E = ERA[id];
        s.road.setTexture(E.road);
        s.cameras.main.setBackgroundColor(E.bg);
        s.formation(['SSSSS', 'GGGGG', 'CHCHC']);
        for (let f = 0; f < 80; f++) { s.invulnUntil = Infinity; s.nextFire = s.t + 1e6; __step(1); }
        return { road: roadKey() === E.road, army: [...new Set(s.enemies.getChildren().map(e => e.texture.key))].sort().join(',') === Object.values(E.army).sort().join(',') };
      }, id);
      check(`${name}: ${id}: its road and all 4 soldier types`, top.road && top.army, JSON.stringify(top));
      await shot(`11-${id}-road`);
      const side = await page.evaluate(id => {
        const s = scene(), tex = o => (o.displayTexture ?? o.texture).key;
        s.enemies.clear(true, true);
        s.clearShots();
        s.bonus = { caught: 0, endsAt: s.t + 1e6 };
        s.setView('side');
        Object.assign(s, { nextRider: s.t, nextDive: s.t + 1e6, nextObstacle: s.t });
        for (let f = 0; f < 90; f++) { s.invulnUntil = Infinity; s.nextFire = s.t + 1e6; __step(1); }
        return {
          anim: s.player.anims.currentAnim?.key, rider: s.enemies.getChildren()[0]?.anims.currentAnim?.key,
          obstacle: s.obstacles.getChildren()[0]?.texture.key, scenery: tex(s.hills) === `hills-${id}` && tex(s.ground) === `ground-${id}`,
        };
      }, id);
      const want = { anim: `ride-${id}`, rider: `rideE-${id}`, obstacle: await page.evaluate(id => ERA[id].obstacle, id), scenery: true };
      check(`${name}: ${id}: bonus chase on its ${await page.evaluate(id => ERA[id].vehicle, id)}, with riders, obstacles and scenery`, JSON.stringify(side) === JSON.stringify(want), JSON.stringify(side));
      await shot(`11-${id}-bonus`);
      await page.evaluate(() => {
        const s = scene();
        s.bonus = null;
        s.enemies.clear(true, true);
        s.obstacles.clear(true, true);
        s.clearShots();
        s.setView('top');
      });
    }

    // A full route with at least two future timelines (one with a bonus chase), whose bonus plan has a chase after the
    // first mini-boss and a mini-boss with no bonus level.
    const routeSeed = await page.evaluate(() => {
      const future = ['chrome', 'waste', 'mars', 'star'];
      for (let i = 1; ; i++) {
        const sd = `ROUTE${i}`, p = bonusPlan(sd, TIMELINES);
        const route = new Phaser.Math.RandomDataGenerator([`${sd}/route`]).shuffle(ERAS.slice()).slice(0, TIMELINES);
        if (p[0] && p.includes(false)
          && route.filter(e => future.includes(e.id)).length >= 2 && route.some((e, k) => future.includes(e.id) && p[k])) return sd;
      }
    });
    const plan = await page.evaluate(sd => bonusPlan(sd, TIMELINES), routeSeed);
    console.log(`     route seed ${routeSeed}, bonus chases: ${plan.map(m => (m ? 'chase' : '-')).join(' ')}`);
    await startRun(page, routeSeed); // a fresh run from wave 1

    const route = await page.evaluate(() => scene().route.map(e => ({ id: e.id, name: e.name.toUpperCase(), road: e.road, mid: e.mid.key, boss: e.boss.key })));
    for (const [stage, kind, key] of checkpointsFor(route, plan)) {
      if (kind === 'chase') {
        const v = await page.evaluate(n => {
          // the bot's late-game build can kill each rider as it appears, so wait for the bonus level, not for riders
          __bot(`scene().stage === ${n} && scene().bonus && scene().bonus.endsAt !== Infinity`, 200);
          const s = scene();
          __step(30);
          const vx = s.bullets.getChildren().reduce((sum, b) => sum + b.body.velocity.x, 0);
          return { stage: s.stage, bonus: !!s.bonus, view: s.view, anim: s.player.anims.currentAnim?.key, ground: s.ground.visible, road: s.road.visible, shots: Math.sign(vx) };
        }, stage);
        const want = { stage, bonus: true, view: 'side', anim: `ride-${key}`, ground: true, road: false, shots: 1 };
        check(`${name}: after wave ${stage}, a bonus chase in ${key}`, JSON.stringify(v) === JSON.stringify(want), JSON.stringify(v));
        await shot(`5-wave-${stage}-bonus-chase-${key}`);
      } else if (kind === 'noBonus') {
        const v = await page.evaluate(n => {
          __bot(`scene().stage === ${n} && (scene().bonus || app.state !== 'playing')`, 200);
          return { stage: scene().stage, bonus: !!scene().bonus, state: app.state };
        }, stage);
        const want = stage === 50 ? 'choice' : 'shop';
        check(`${name}: after wave ${stage}'s boss, no bonus level: straight to the ${want}`, v.stage === stage && !v.bonus && v.state === want, JSON.stringify(v));
      } else if (kind === 'top') {
        const v = await page.evaluate(n => {
          __bot(`scene().stage === ${n} && app.state === 'playing'`, 200);
          __step(30);
          return { view: scene().view, anim: scene().player.anims.currentAnim?.key, road: scene().road.visible, obstacles: window.__obstacles };
        }, stage);
        check(`${name}: back on foot for wave ${stage} (and obstacles showed up in the bonus chase)`, v.view === 'top' && v.anim === 'walk' && v.road && v.obstacles >= 1, JSON.stringify(v));
      } else if (kind === 'timeline') {
        const next = await page.evaluate(n => {
          __bot(`scene().stage === ${n} && /WAVES ${n}-/.test(scene().lastBanner)`, 120); // the new level's card
          __step(30); // let the new road and the card fade in before the screenshot
          return { stage: scene().stage, card: scene().lastBanner, road: roadKey(), parts: scene().parts, rows: scene().packRows };
        }, stage);
        const parts = (stage - 1) / 10;
        check(`${name}: wave ${stage} jumps to ${key.name} with ${parts} part(s), and the backpack has grown a row per boss`,
          next.card.includes(key.name) && next.road === key.road && next.parts === parts && next.rows === BACKPACK_ROWS + parts, JSON.stringify(next));
        await shot(`6-stage-${stage}-card`);
      } else {
        // Look for the boss arriving: by late stages the bot's build can kill it the moment it becomes hittable.
        const got = await page.evaluate(n => { __bot(`scene().stage === ${n} && scene().boss`, 400); return { stage: scene().stage, boss: scene().boss?.cfg.key }; }, stage);
        check(`${name}: boss on wave ${stage} (${key})`, got.stage === stage && got.boss === key, JSON.stringify(got));
        await page.evaluate(() => { __step(140); scene().boss?.clearTint(); }); // let it fly in; no white hit-flash in the picture
        await shot(`5-boss-stage-${stage}`);
        if (stage === 5) {
          // (stop at the bonus level or shop that follows, so the next checkpoint still sees it)
          const hp = await page.evaluate(() => { scene().hp = 1; __bot(`scene().bonus || app.state === 'shop'`, 60); return { hp: scene().hp, max: scene().P.maxHp }; });
          check(`${name}: mid-boss coffee heals fully`, hp.hp === hp.max, JSON.stringify(hp));
        }
      }
    }

    // Wave 50's boss drops the 5th part, then comes the choice. Go endless.
    const choice = await page.evaluate(() => { __bot(`app.state === 'choice'`, 200); return { state: app.state, parts: scene().parts }; });
    check(`${name}: after wave 50, the 5th part brings up the go-home-or-endless choice`, choice.state === 'choice' && choice.parts === 5 && (await visible(page, 'choice')), JSON.stringify(choice));
    await shot('7-choice');
    await page.click('#choice [data-action=endless]');
    const endless = await page.evaluate(() => {
      __bot(`scene().stage === 51 && /WAVES 51-/.test(scene().lastBanner)`, 120);
      const s = scene();
      return { stage: s.stage, endless: s.endless, era: s.E.id, picked: s.route.length, hud: s.hud.text.includes('ENDLESS'), card: s.lastBanner };
    });
    check(`${name}: endless continues to wave 51 in a seeded timeline`, endless.stage === 51 && endless.endless && endless.picked === 6 && endless.hud && endless.card.includes('WAVES 51-55'), JSON.stringify(endless));
    await shot('8-endless-51');
    const later = await page.evaluate(() => { __bot(`scene().stage === 61`, 400); return { stage: scene().stage, picked: scene().route.length, distinct: scene().route[5] !== scene().route[6] }; });
    check(`${name}: endless picks another timeline at wave 61`, later.stage === 61 && later.picked === 7 && later.distinct, JSON.stringify(later));
  }

  if (name === 'desktop') { // the other ending: after the 5th part, go home
    const home = await page.evaluate(() => {
      const s = scene();
      s.invulnUntil = Infinity;
      s.stage = FINAL_STAGE;
      s.parts = TIMELINES - 1;
      s.collect(s.drop('part', s.player.x, s.player.y));
      __bot(`app.state === 'choice'`, 120);
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

  if (name === 'phone') { // every army's lineup: grunt, sharpshooter, charger, heavy
    await page.evaluate(() => {
      document.getElementById('sheet')?.remove();
      const sheet = document.createElement('div');
      sheet.id = 'sheet';
      sheet.style.cssText = 'position:fixed;inset:0;z-index:9;background:#140a26;padding:14px;overflow:hidden;font:11px monospace;color:#fff';
      for (const e of ERAS) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:14px;align-items:flex-end;margin-bottom:12px';
        const label = document.createElement('span');
        label.style.width = '80px';
        label.textContent = e.name;
        row.append(label);
        for (const k of 'GSCH') {
          const img = new Image();
          img.src = game.textures.getBase64(e.army[k]);
          img.style.imageRendering = 'pixelated';
          row.append(img);
        }
        sheet.append(row);
      }
      document.body.append(sheet);
    });
    await page.waitForTimeout(300);
    await shot('10-armies');
  }

  if (name === 'phone') { // sprite sheets: every texture at 2x, for checking the pixel art
    const keys = await page.evaluate(() => Object.keys(ART).sort((a, b) => b.startsWith('vega') - a.startsWith('vega')).filter(k => !/^ride.*1$/.test(k)));
    const per = Math.ceil(keys.length / 3); // three pages, it's a lot
    for (const [i, part] of [0, 1, 2].map(k => keys.slice(k * per, (k + 1) * per)).entries()) {
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

// Your own sprites: pretend assets/sprites/ holds two PNGs (the donut template as the coin, the King Lizard's first
// idle frame as Vega) and check they replace the built-in ones, and that Vega's hitbox and gun follow his new size.
async function customSprites(browser) {
  const templates = path.resolve(__dirname, '..', 'assets', 'templates');
  if (!fs.existsSync(path.join(templates, 'trex0.png'))) return check('custom sprites: templates exported', false, 'run node tools/sprites.js export');
  const png = fs.readFileSync(path.join(templates, 'trex0.png')), tw = png.readUInt32BE(16), th = png.readUInt32BE(20);
  const page = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/assets/sprites/list.js', r => r.fulfill({ contentType: 'text/javascript', body: "const CUSTOM_SPRITES = ['coin', 'vega0'];" }));
  await page.route('**/assets/sprites/coin.png', r => r.fulfill({ path: path.join(templates, 'donut.png') }));
  await page.route('**/assets/sprites/vega0.png', r => r.fulfill({ path: path.join(templates, 'trex0.png') }));
  await page.goto(url);
  await page.waitForFunction(() => typeof scene === 'function' && !!scene(), null, { timeout: 15000 });
  await page.click('#main .primary');
  await page.click('#story .primary');
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const s = scene(), size = k => { const i = game.textures.get(k).getSourceImage(); return `${i.width}x${i.height}`; };
    s.player.setTexture('vega0');
    s.footHitbox();
    return { coin: size('coin'), vega0: size('vega0'), vega1: size('vega1'), walking: s.player.anims.isPlaying, body: Math.round(s.player.body.width), muzzle: Math.round(s.player.y - s.muzzle().y) };
  });
  check('custom sprites replace the built-in ones (the rest stay generated)', r.coin === '36x24' && r.vega0 === `${tw}x${th}` && r.vega1 === '70x80' && r.walking, JSON.stringify(r));
  check("custom sprites: Vega's hitbox and gun position follow his sprite's size", r.body === Math.round(tw * 0.43) && r.muzzle === Math.round(th * 0.475), JSON.stringify(r));
  await page.screenshot({ path: path.join(out, 'custom-sprites.png') }).catch(() => {});
  check('custom sprites: no page errors', errors.length === 0, errors.join(' | '));
}

(async () => {
  const server = await serve(path.resolve(__dirname, '..'));
  url = `${server.url}/index.html`;
  const browser = await chromium.launch();
  try {
    await customSprites(browser);
    await run(browser, 'phone', { viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
    await run(browser, 'desktop', { viewport: { width: 1280, height: 720 } });
  } finally {
    await browser.close();
    server.close();
  }
  console.log(failures.length ? `\n${failures.length} failed` : `\nall passed; screenshots in ${out}`);
  process.exit(failures.length ? 1 : 0);
})();
