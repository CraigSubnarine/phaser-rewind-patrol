// Rewind Patrol: the game scene. Loaded last (after data.js, art.js and ui.js).

const SHOT_GLOW = 6; // pixels of glow and rings around every shot (see Play.glowTexture)

class Play extends Phaser.Scene {
  constructor() { super('play'); }

  // Your own sprites: any PNG listed in assets/sprites/list.js replaces the built-in sprite of the same name.
  preload() {
    for (const key of CUSTOM_SPRITES) if (!this.textures.exists(key)) this.load.image(key, `assets/sprites/${key}.png`);
  }

  create(data) {
    this.playing = !!data?.play;
    // Textures and animations are shared by every restart, so they're made once. Only the sprites you haven't
    // supplied yourself are generated.
    for (const [key, rows] of Object.entries(ART)) {
      if (!this.textures.exists(key)) this.textures.generate(key, { data: rows, pixelWidth: PIXEL[key] ?? 4, palette: PAL });
    }
    makeRoads(this);
    makeSides(this);
    if (!this.anims.exists('walk')) {
      this.anims.create({ key: 'walk', frames: ['vega1', 'vega0', 'vega2', 'vega0'].map(key => ({ key })), frameRate: 10, repeat: -1 });
      for (const era of ERAS) for (const k of [`ride-${era.id}-f`, `ride-${era.id}-b`, `rideE-${era.id}-f`, `rideE-${era.id}-b`]) {
        this.anims.create({ key: k, frames: [{ key: `${k}0` }, { key: `${k}1` }], frameRate: 6, repeat: -1 });
      }
      for (const era of ERAS) for (const { key } of [era.mid, era.boss]) {
        this.anims.create({ key: `${key}-idle`, frames: [{ key: `${key}0` }, { key: `${key}1` }], frameRate: 3, repeat: -1 });
      }
    }
    this.diff = DIFFICULTY[settings.difficulty];
    this.t = 0; // game time that stops while paused (update() isn't called then)

    this.cameras.main.setBackgroundColor(0x140a26);
    this.road = this.add.tileSprite(W / 2, H / 2, W, H, 'road-1986');
    // Side-view scenery for vehicle stages, hidden until one starts.
    this.hills = this.add.tileSprite(W / 2, GROUND_Y - 110, W, 220, 'hills-rome').setVisible(false);
    this.ground = this.add.tileSprite(W / 2, GROUND_Y + 235, W, 470, 'ground-rome').setVisible(false);
    this.view = 'top';
    this.aim = -Math.PI / 2; // the way Vega shoots: up on foot, ahead or behind in a vehicle
    // Streaks rushing past: only shown during a time jump between timelines.
    this.streaks = Array.from({ length: 40 }, () => {
      const s = this.add.image(Phaser.Math.Between(0, W), Phaser.Math.Between(0, H), 'streak').setDepth(4).setVisible(false);
      s.speed = Phaser.Math.Between(400, 900);
      return s.setAlpha(Phaser.Math.FloatBetween(0.3, 0.8));
    });

    // Vega walks the road the whole time; the road scrolling under him is what moves him forward.
    this.player = this.physics.add.sprite(W / 2, H - 110, 'vega0').setDepth(2).play('walk');
    this.footHitbox();
    this.sparks = this.add.particles(0, 0, 'spark', {
      speed: { min: 60, max: 280 }, lifespan: { min: 250, max: 650 }, scale: { start: 1.4, end: 0 },
      tint: [0xffffff, 0xffd23b, 0xff4fd8, 0x4ff0ff], emitting: false,
    }).setDepth(3);

    if (!this.playing) return; // main-menu backdrop: Vega walking down a 1986 street

    this.bullets = this.physics.add.group();
    this.enemyShots = this.physics.add.group();
    this.enemies = this.physics.add.group();
    this.pickups = this.physics.add.group();
    this.physics.add.overlap(this.bullets, this.enemies, (b, e) => this.bulletHit(b, e));
    this.physics.add.overlap(this.player, this.enemyShots, (s, shot) => { if (this.hitPlayer()) shot.destroy(); });
    this.physics.add.overlap(this.player, this.enemies, (s, e) => { if (this.hitPlayer()) this.killEnemy(e, false); });
    this.physics.add.overlap(this.player, this.pickups, (s, p) => this.collect(p));
    // Rocks and barrels on vehicle stages: they hurt to hit and soak up shots (piercing shots go through).
    this.obstacles = this.physics.add.group();
    this.physics.add.overlap(this.player, this.obstacles, () => this.hitPlayer());
    this.physics.add.overlap(this.bullets, this.obstacles, b => { if (b.pierce > 0) b.pierce--; else b.destroy(); });

    // false = don't swallow these keys, so the menus keep working with the keyboard.
    this.keys = this.input.keyboard.addKeys('LEFT,RIGHT,UP,DOWN,A,D,W,S', false);
    this.hud = this.add.text(14, 14, '', { fontFamily: FONT, fontSize: '14px', color: '#ffffff', lineSpacing: 8, stroke: '#000000', strokeThickness: 4 }).setDepth(10);
    this.shieldRing = this.add.graphics().setDepth(3);
    this.hpBars = this.add.graphics().setDepth(3); // health bars over soldiers that take more than one hit
    this.partners = [];
    this.drones = []; // Drone Buddy

    // Everything about this run. The seeded generator rolls the shop, so the same seed gives the same offers.
    this.rng = new Phaser.Math.RandomDataGenerator([app.seed]);
    // The seed also picks this run's 5 timelines, and (past stage 50) the endless ones, on their own generators so
    // the shop rolls don't shift them around.
    this.route = new Phaser.Math.RandomDataGenerator([`${app.seed}/route`]).shuffle(ERAS.slice()).slice(0, TIMELINES);
    this.endlessRng = new Phaser.Math.RandomDataGenerator([`${app.seed}/endless`]);
    this.bonusRng = new Phaser.Math.RandomDataGenerator([`${app.seed}/bonus`]); // which mini-bosses lead into a bonus level
    this.stars = []; // Shuriken Ring
    Object.assign(this, {
      loadout: Object.fromEntries(Object.entries(SLOTS).map(([k, s]) => [k, Array(s.n).fill(null)])), spent: {}, // see SLOTS
      score: 0, coins: 0, owned: {}, combos: [], parts: 0, best: store.get(bestKey(), 0), newBest: false,
      nextFire: 0, volleys: 0, nextCannon: 0, nextEnemyShot: 0, invulnUntil: 0, shieldNextAt: 0,
      waveActive: false, spawnsLeft: 0, nextCharge: 0, boss: null, vacuum: false, stage: 0, era: 0,
      target: { x: this.player.x, y: this.player.y },
      charge: 0, frozenUntil: 0, testudoUntil: 0, streamTimers: [], sideMode: null, nextObstacle: 0,
      nextAxe: 0, nextBoomerang: 0, orbitAngle: 0, chargeLockUntil: 0, endless: false,
      nextDrone: 0, nextMolotov: 0, nextDrill: 0, nextTorpedo: 0, nitroUntil: 0, // future gear
      bonus: null, nextRider: 0, hudSecs: 0, // bonus levels
      et: 0, // enemy clock: like t, but it stops while the Siren has enemies frozen
      hazards: [], // bosses' lane attacks: { x0, x1, until, bar }
    });
    this.refreshStats();
    this.hp = this.P.maxHp;
    this.shield = this.P.shieldMax;
    updateItemBtn();
    this.startStage(1);
  }

  // ----- Upgrades -----
  // Recompute Vega's stats from the upgrades owned. Returns the combos this just unlocked.
  refreshStats() {
    const { stats, combos } = computeStats(this.owned, this.diff.hp);
    const unlocked = combos.filter(c => !this.combos.includes(c));
    this.P = stats;
    this.combos = combos;
    // Companions: the one in the first companion slot walks on Vega's left, the other on his right.
    for (const c of [...this.partners, ...this.drones]) c.destroy();
    this.partners = [];
    this.drones = [];
    this.loadout.companion.forEach((id, i) => {
      if (!id) return;
      const side = i ? 1 : -1, img = this.add.image(this.player.x + side * 60, this.player.y, id).setDepth(id === 'drone' ? 3 : 2);
      img.setVisible(id === 'drone' || this.view !== 'side'); // partners sit out vehicle stages (see setView)
      (id === 'drone' ? this.drones : this.partners).push(Object.assign(img, { side }));
    });
    if (this.hp > stats.maxHp) this.hp = stats.maxHp;
    this.shield = Math.min(this.shield ?? 0, stats.shieldMax);
    return unlocked;
  }

  // Where buying `u` would go in its slot: [index, the item it would replace or null]. `replace` picks which one in a
  // full two-place slot (default: the first).
  placeFor(u, replace) {
    const row = this.loadout[u.slot];
    if (row.includes(u.id)) return [row.indexOf(u.id), null]; // owned: a level up
    if (row.includes(null)) return [row.indexOf(null), null];
    const i = replace ? row.indexOf(replace) : 0;
    return [i, row[i]];
  }
  refundFor(id) { return id ? Math.floor((this.spent[id] || 0) / 2) : 0; }

  // Called by the shop. Fills a slot, levels the item up, or replaces what's in the slot (which sells back for half).
  // Returns the combos the purchase unlocked (maybe none), or null if it couldn't be bought.
  buy(u, replace) {
    const cost = priceOf(u, this.owned), [i, old] = this.placeFor(u, replace);
    if (i < 0 || this.coins + this.refundFor(old) < cost || (this.owned[u.id] || 0) >= u.max) return null;
    if (old) {
      this.coins += this.refundFor(old);
      delete this.owned[old];
      delete this.spent[old];
    }
    if (u.active && this.loadout.active[0] !== u.id) this.charge = 0; // a new active item starts uncharged
    this.loadout[u.slot][i] = u.id;
    this.coins -= cost;
    this.spent[u.id] = (this.spent[u.id] || 0) + cost;
    this.owned[u.id] = (this.owned[u.id] || 0) + 1;
    const unlocked = this.refreshStats();
    if (u.heal) this.hp = Math.min(this.hp + u.heal, this.P.maxHp);
    if (u.id === 'scutum' || u.id === 'deflector') this.shield = this.P.shieldMax;
    this.updateHud();
    updateItemBtn(); // (shown once the shop closes; also right away if an item is bought mid-wave)
    return unlocked;
  }

  // ----- Active items -----
  chargeNeeded() {
    return this.P.active ? this.P.active.active.charge / this.P.chargeMult : Infinity;
  }

  addCharge(n) {
    if (!this.P.active || this.t < this.chargeLockUntil) return; // an item's own kills don't recharge it
    const was = this.charge >= this.chargeNeeded();
    this.charge = Math.min(this.charge + n, this.chargeNeeded());
    if (!was && this.charge >= this.chargeNeeded()) { this.toast('ITEM READY', this.player.x, this.player.y - 60, '#ff4fd8'); beep(1320, 80); }
    updateItemBtn();
  }

  isBossStage() {
    return ((this.stage - 1) % STAGES_PER_ERA + 1) % 5 === 0;
  }

  // Fire the held item if it's charged. Returns true if it went off.
  useActive() {
    const item = this.P?.active;
    if (!item || app.state !== 'playing' || !this.player.active || this.charge < this.chargeNeeded()) return false;
    const P = this.P, effect = item.active.effect;
    if (effect === 'skip' && (this.isBossStage() || this.bonus || !this.waveActive)) {
      const why = this.bonus ? 'NOT IN BONUS LEVELS' : this.isBossStage() ? 'NOT ON BOSS WAVES' : 'NOTHING TO SKIP';
      this.toast(why, this.player.x, this.player.y - 60, '#ff4fd8');
      return false;
    }
    if (effect === 'clear') { // Air Support: everything on screen goes, bosses take a big hit
      this.banner('AIR SUPPORT!', 1200, 26);
      this.cameras.main.flash(300, 255, 240, 200);
      boom(600, 0.14);
      for (const e of this.enemies.getChildren().slice()) if (e.y > -20) this.killEnemy(e, true);
      this.clearShots();
      if (this.boss?.ready) this.damage(this.boss, 30 * this.dmgNow(), true);
    } else if (effect === 'skip') { // VCR Remote: this wave is over, on to the next
      this.banner('FAST FORWARD >>', 1200, 24);
      jingle([1046, 1318, 1568]);
      this.streamTimers.forEach(t => t.remove());
      this.spawnsLeft = 0;
      for (const e of this.enemies.getChildren().slice()) { this.sparks.explode(8, e.x, e.y); e.destroy(); }
      this.clearShots();
      this.waveCleared();
    } else if (effect === 'freeze') { // Siren: enemies stop, their shots vanish
      this.banner('SIREN!', 1000, 26);
      jingle([880, 660, 880, 660]);
      this.frozenUntil = this.t + 5000;
      this.clearShots();
    } else if (effect === 'invuln') { // Testudo
      this.banner('TESTUDO!', 1000, 26);
      this.testudoUntil = this.t + P.testudoMs;
      this.invulnUntil = Math.max(this.invulnUntil, this.testudoUntil);
      if (P.testudoShield) this.shield = P.shieldMax;
      jingle([523, 659, 784]);
    } else if (effect === 'trebuchet') { // a boulder lands on the boss (or where the enemies are) in a huge blast
      const { x, y } = this.hotspot();
      const rock = this.add.image(x, -80, 'boulder').setScale(4).setDepth(5);
      this.tweens.add({ targets: rock, y, angle: 360, duration: 500, ease: 'Quad.easeIn', onComplete: () => {
        rock.destroy();
        this.cameras.main.shake(400, 0.02);
        this.explode(x, y, 230, 12 * this.dmgNow(), false);
      } });
    } else if (effect === 'broadside') { // a fan of exploding cannonballs
      const { x, y } = this.muzzle();
      for (let i = 0; i < P.broadside; i++) {
        const a = this.aim - 1 + 2 * i / (P.broadside - 1);
        this.spawnBullet(x, y, 'cannonball', a, { dmg: 3 * this.dmgNow(), pierce: 0, bounce: P.cannonBounce, explode: P.cannonRadius, cannon: true, speed: 480, scale: 2 });
      }
      boom(500, 0.12);
    } else if (effect === 'stampede') { // a herd charges up the screen (across it in a vehicle), trampling everything
      this.banner('STAMPEDE!', 1200, 26);
      this.cameras.main.shake(1300, 0.008);
      boom(900, 0.1);
      const side = this.view === 'side', dmg = 8 * this.dmgNow() * P.stampedeMult;
      for (let i = 0; i < 8; i++) {
        const bull = this.add.image(side ? -40 : 40 + i * 74, side ? BAND_TOP + 20 + i * 52 : H + 40, 'bull').setScale(2.5).setDepth(5).setAngle(side ? 90 : 0);
        this.tweens.add({ targets: bull, [side ? 'x' : 'y']: side ? W + 60 : -60, duration: 1200, delay: i * 50, onComplete: () => bull.destroy() });
      }
      for (const e of this.enemies.getChildren().slice()) { // each enemy is hit as the herd reaches it
        this.time.delayedCall(Math.max(0, side ? e.x / W * 1200 : (H - e.y) / H * 1200), () => this.damage(e, dmg, false));
      }
      if (this.boss?.ready) this.time.delayedCall(900, () => this.boss && this.damage(this.boss, dmg, true));
    } else if (effect === 'blossom') { // razor petals cut every enemy on screen and wipe out their shots
      this.banner('PETAL STORM!', 1200, 24);
      this.clearShots();
      for (let i = 0; i < 40; i++) {
        const petal = this.add.image(Phaser.Math.Between(0, W), -20, 'spark').setTint(0xffb7d5).setScale(3).setDepth(5);
        this.tweens.add({ targets: petal, y: H + 20, x: petal.x + Phaser.Math.Between(-140, 140), angle: 360, duration: Phaser.Math.Between(700, 1300), onComplete: () => petal.destroy() });
      }
      for (const e of this.enemies.getChildren().slice()) if (this.isOnScreen(e)) this.damage(e, 6 * this.dmgNow(), false);
      if (this.boss?.ready) this.damage(this.boss, 15 * this.dmgNow(), true);
      jingle([1318, 1046, 1568, 1318]);
    } else if (effect === 'thunder') { // 10 lightning bolts on enemies (every third one on the boss)
      this.banner('THUNDER!', 1000, 26);
      const bolt = this.add.graphics().setDepth(6);
      for (let i = 0; i < 10; i++) {
        this.time.delayedCall(i * 90, () => {
          const foes = this.enemies.getChildren().filter(e => this.isOnScreen(e));
          const tgt = this.boss?.ready && (i % 3 === 0 || !foes.length) ? this.boss : Phaser.Utils.Array.GetRandom(foes);
          if (!tgt) return;
          bolt.clear().lineStyle(4, 0xcfe8ff, 1).beginPath().moveTo(tgt.x + Phaser.Math.Between(-60, 60), 0);
          for (let k = 1; k <= 6; k++) bolt.lineTo(k === 6 ? tgt.x : tgt.x + Phaser.Math.Between(-30, 30), tgt.y * k / 6);
          bolt.strokePath();
          this.cameras.main.flash(80, 200, 220, 255);
          boom(120, 0.08);
          this.damage(tgt, 8 * this.dmgNow(), tgt === this.boss);
        });
      }
      this.time.delayedCall(1000, () => bolt.destroy());
    } else if (effect === 'meteor') { // meteors rain down on the enemies (and the boss) for 3 s
      this.banner('METEOR SHOWER!', 1200, 22);
      for (let i = 0; i < 14; i++) {
        this.time.delayedCall(i * 210, () => {
          const foes = this.enemies.getChildren().filter(e => this.isOnScreen(e));
          const tgt = this.boss?.ready && i % 4 === 0 ? this.boss : Phaser.Utils.Array.GetRandom(foes);
          const x = tgt ? tgt.x : Phaser.Math.Between(60, W - 60), y = tgt ? tgt.y : Phaser.Math.Between(120, H - 300);
          const rock = this.add.image(x - 120, y - 300, 'boulder').setScale(3).setTint(0xff8844).setDepth(5);
          this.tweens.add({ targets: rock, x, y, duration: 350, ease: 'Quad.easeIn', onComplete: () => { rock.destroy(); this.explode(x, y, 85, 5 * this.dmgNow(), false); } });
        });
      }
    } else if (effect === 'emp') { // a pulse: damages and freezes every enemy on screen, wipes out their shots
      this.banner('EMP!', 1000, 26);
      this.frozenUntil = Math.max(this.frozenUntil, this.t + 3000);
      this.clearShots();
      const ring = this.add.circle(this.player.x, this.player.y, 40, 0x4ff0ff, 0.3).setStrokeStyle(4, 0x4ff0ff).setDepth(5);
      this.tweens.add({ targets: ring, scale: 18, alpha: 0, duration: 600, onComplete: () => ring.destroy() });
      for (const e of this.enemies.getChildren().slice()) if (this.isOnScreen(e)) this.damage(e, 4 * this.dmgNow(), false);
      if (this.boss?.ready) this.damage(this.boss, 10 * this.dmgNow(), true);
      jingle([1568, 784, 392]);
    } else if (effect === 'nitro') { // 5 s of triple fire rate and double speed (see fireDelay and update)
      this.banner('NITRO!', 1000, 26);
      this.nitroUntil = this.t + 5000;
      jingle([392, 523, 784, 1046]);
    } else if (effect === 'orbital') { // a beam from orbit on every enemy on screen, and on the boss
      this.banner('ORBITAL STRIKE!', 1000, 22);
      this.cameras.main.flash(200, 220, 255, 255);
      boom(500, 0.12);
      const targets = this.enemies.getChildren().filter(e => this.isOnScreen(e));
      if (this.boss?.ready) targets.push(this.boss);
      targets.forEach((e, i) => this.time.delayedCall(i * 40, () => {
        if (!e.active) return;
        const beam = this.add.rectangle(e.x, e.y / 2, 26, e.y, 0xb0ffff, 0.9).setDepth(6);
        this.tweens.add({ targets: beam, alpha: 0, scaleX: 0.2, duration: 300, onComplete: () => beam.destroy() });
        this.damage(e, (e === this.boss ? 25 : 10) * this.dmgNow(), e === this.boss);
      }));
    } else if (effect === 'blackhole') { // pulls every enemy on screen into one spot, then collapses on them
      this.banner('BLACK HOLE!', 1000, 26);
      const { x, y } = this.hotspot();
      for (const e of this.enemies.getChildren()) {
        if (!this.isOnScreen(e)) continue;
        Object.assign(e, { pullFrom: e.mode, mode: 'pulled', pullX: x, pullY: y, windup: 0, snipeAt: 0 });
        e.clearTint();
      }
      const hole = this.add.circle(x, y, 12, 0x000000).setStrokeStyle(3, 0xc77dff).setDepth(4);
      this.tweens.add({ targets: hole, scale: 6, angle: 360, duration: 1400, ease: 'Sine.easeIn', onComplete: () => {
        hole.destroy();
        this.cameras.main.shake(300, 0.015);
        this.explode(x, y, 170, 15 * this.dmgNow(), false);
        for (const e of this.enemies.getChildren()) if (e.mode === 'pulled') this.release(e);
      } });
      boom(700, 0.1);
    }
    this.charge = 0;
    this.chargeLockUntil = this.t + 3500; // its own kills (some land a moment later) don't refill it
    updateItemBtn();
    return true;
  }

  // Where big blasts land: on the boss, or in the middle of the enemies on screen.
  hotspot() {
    const foes = this.enemies.getChildren().filter(e => this.isOnScreen(e));
    const avg = k => foes.reduce((sum, e) => sum + e[k], 0) / foes.length;
    if (this.boss?.ready) return { x: this.boss.x, y: this.boss.y };
    return foes.length ? { x: avg('x'), y: avg('y') } : { x: W / 2, y: 260 };
  }

  // A soldier the Black Hole let go: back to its place in the formation (or its ride), or off down the screen.
  release(e) {
    if (e.pullFrom === 'ride' || e.pullFrom === 'ram') Object.assign(e, { mode: 'ride', fromX: e.x, baseY: e.y, enter: 0 });
    else if (e.homeX !== undefined) Object.assign(e, { mode: 'formation', fromX: e.x, fromY: e.y, enter: 0 });
    else return void Object.assign(e, { mode: 'dive', vx: 0, vy: 200 });
    this.tweens.add({ targets: e, enter: 1, duration: 1200, ease: 'Sine.easeOut' });
  }

  // The nearest enemy (or boss) on screen to a point, or null. `skip`: ones a piercing shot has already hit.
  nearestFoe(x, y, skip) {
    let best = null, bd = Infinity;
    for (const e of [...this.enemies.getChildren(), this.boss?.ready ? this.boss : null]) {
      if (!e || !this.isOnScreen(e) || skip?.has(e)) continue;
      const d = Phaser.Math.Distance.Squared(x, y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // Four cards: up to 2 pieces of this timeline's gear, the rest general gear, nothing already maxed out.
  rollOffers() {
    const era = this.E.id;
    const open = UPGRADES.filter(u => (this.owned[u.id] || 0) < u.max);
    const local = this.rng.shuffle(open.filter(u => u.era === era)).slice(0, 2);
    const general = this.rng.shuffle(open.filter(u => !u.era)).slice(0, 4 - local.length);
    return [...local, ...general];
  }

  // ----- HUD and messages -----
  setStreaks(on, tint = 0xffffff) {
    for (const s of this.streaks) s.setVisible(on).setTint(tint);
  }

  banner(text, ms, size = 22) {
    this.lastBanner = text;
    const t = this.add.text(W / 2, H * 0.42, text, {
      fontFamily: FONT, fontSize: `${size}px`, color: '#ff4fd8', align: 'center', stroke: '#140a26', strokeThickness: 6, lineSpacing: 14,
    }).setOrigin(0.5).setDepth(10).setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, duration: 250, hold: ms - 500, yoyo: true, onComplete: () => t.destroy() });
  }

  // Small floating text, e.g. BLOCKED or CRIT.
  toast(text, x, y, color = '#ffffff') {
    const t = this.add.text(x, y, text, { fontFamily: FONT, fontSize: '12px', color, stroke: '#000000', strokeThickness: 4 }).setOrigin(0.5).setDepth(10);
    this.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: 800, onComplete: () => t.destroy() });
  }

  updateHud() {
    const shield = this.shield ? `+${this.shield}` : '';
    const drive = this.endless ? 'ENDLESS' : `DRIVE ${this.parts}/${TIMELINES}`;
    const b = this.bonus, secs = b && Math.ceil(Math.max(0, Math.min(BONUS_TIME, b.endsAt - this.t)) / 1000);
    const where = b ? `BONUS ${secs}s  CAUGHT ${b.caught}` : `WAVE ${this.stage}`;
    this.hud.setText(`SCORE ${this.score}   ${where}\nHP ${this.hp}/${this.P.maxHp}${shield}  $${Math.floor(this.coins)}  ${drive}`);
  }

  addScore(n) {
    this.score += n;
    if (this.score > this.best) {
      this.best = this.score;
      this.newBest = true;
      store.set(bestKey(), this.best);
    }
    this.updateHud();
  }

  addCoins(n) {
    this.coins += n * this.P.coinMult;
    this.updateHud();
  }

  // ----- Run flow -----
  // Waves come in levels of 5, played back to back: a level card at the start, a quick "WAVE n" call between waves,
  // and the 5th wave is a boss. After every level comes the shop; a mini-boss level sometimes leads into a bonus
  // vehicle level first (a chase or an escape). (`this.stage` is the wave number, 1-50 and on into endless.)
  // Timeline number n of this run (0-based): one of the 5 the seed picked, then in endless a seeded pick every
  // 10 stages, never the same one twice in a row.
  eraFor(n) {
    while (this.route.length <= n) {
      const prev = this.route[this.route.length - 1];
      this.route.push(this.endlessRng.pick(ERAS.filter(e => e !== prev)));
    }
    return this.route[n];
  }

  // Toughness follows how far into the run you are, whichever timelines the seed picked.
  enemyHp() {
    return 1 + 0.25 * Math.floor((this.stage - 1) / 5); // +0.25 every level (5 waves): 1 at wave 1, 3.25 by waves 46-50
  }

  bossHp(main) {
    return Math.round((main ? 90 + 50 * this.era : 50 + 30 * this.era) * this.diff.bossHp);
  }

  startStage(n) {
    this.stage = n;
    this.era = Math.floor((n - 1) / STAGES_PER_ERA);
    this.E = this.eraFor(this.era);
    const s = (n - 1) % STAGES_PER_ERA + 1, era = this.E, isBoss = s % 5 === 0;
    this.updateHud();
    const go = () => (isBoss ? this.spawnBoss(s === STAGES_PER_ERA) : this.spawnStage(s));
    if ((n - 1) % 5 !== 0) { // mid-level: keep the action going
      this.banner(isBoss ? `WAVE ${n}\nBOSS` : `WAVE ${n}`, 1100, 22);
      this.time.delayedCall(isBoss ? 1300 : 900, go);
      return;
    }
    const card = () => { // a new level: the timeline card
      this.setView('top');
      this.banner(`${era.name.toUpperCase()}\n${era.year}\n\nLEVEL ${Math.ceil(n / 5)}\nWAVES ${n}-${n + 4}`, 2200, 24);
      this.time.delayedCall(2400, go);
    };
    if (s === 1) this.timeJump(era, card); else card();
  }

  isBonus() {
    return !!this.bonus;
  }

  // Swap between walking the road (top-down) and a vehicle stage (side view, chasing or being chased).
  setView(view, mode = null) {
    if (view === this.view && mode === this.sideMode) return;
    const era = this.E, side = view === 'side';
    this.view = view;
    this.sideMode = mode;
    this.cameras.main.fadeIn(350, 0, 0, 0);
    this.bullets.clear(true, true); // shots from the last view would fly through the new scenery
    this.clearShots();
    this.road.setVisible(!side);
    this.hills.setVisible(side).setTexture(`hills-${era.id}`);
    this.ground.setVisible(side).setTexture(`ground-${era.id}`);
    this.cameras.main.setBackgroundColor(side ? era.sky : era.bg);
    for (const pt of this.partners) pt.setVisible(!side); // in a vehicle their shots come from Vega's ride instead
    if (side) {
      this.aim = mode === 'chase' ? 0 : Math.PI;
      this.player.play(`ride-${era.id}-${mode === 'chase' ? 'f' : 'b'}`);
      this.player.body.setSize(this.player.width * 0.55, this.player.height * 0.5, true);
      this.placePlayer(mode === 'chase' ? 140 : W - 140, (BAND_TOP + H) / 2);
    } else {
      this.aim = -Math.PI / 2;
      this.player.play('walk');
      this.footHitbox();
      this.placePlayer(W / 2, H - 110);
    }
  }

  // Between timelines the road fades out, time streaks rush past, and the next timeline's road fades in.
  timeJump(era, then) {
    jingle([392, 523, 659, 784, 1046]);
    this.banner('TIME JUMP!', 1300, 26);
    this.tweens.add({ targets: this.road, alpha: 0, duration: 300 });
    this.setStreaks(true, era.lines);
    this.time.delayedCall(1400, () => {
      this.road.setTexture(era.road);
      this.cameras.main.setBackgroundColor(era.bg);
      this.tweens.add({ targets: this.road, alpha: 1, duration: 300 });
      this.setStreaks(false);
      then();
    });
  }

  // A wave is done: a few coins, and straight on to the next wave of the level.
  waveCleared() {
    this.waveActive = false;
    if (this.P.o2Every && this.stage % this.P.o2Every === 0 && this.hp > 0 && this.hp < this.P.maxHp) { // O2 Tank
      this.hp++;
      this.toast('+1 HP', this.player.x, this.player.y - 50, '#4ff0ff');
    }
    this.addCoins(2 + this.era);
    this.time.delayedCall(800, () => { if (this.hp > 0) this.startStage(this.stage + 1); });
  }

  // A level is done (its boss is down): every coin left flies to Vega, then maybe a bonus level, then the shop.
  levelCleared() {
    this.waveActive = false;
    if (this.P.regen && this.hp > 0) this.hp = Math.min(this.hp + this.P.regen, this.P.maxHp); // Hearth Fire
    if (this.P.stageShield) this.shield = this.P.shieldMax; // Shield Maiden
    this.vacuum = true;
    this.time.delayedCall(1300, () => {
      if (this.hp <= 0) return;
      for (const p of this.pickups.getChildren().slice()) this.collect(p);
      this.vacuum = false;
      this.clearShots();
      const mode = this.rollBonus();
      if (mode) this.startBonus(mode);
      else this.afterLevel();
    });
  }

  // Only a mini-boss level can lead into a bonus level, and only sometimes. Seeded: same seed, same bonus levels.
  rollBonus() {
    if (this.stage % STAGES_PER_ERA === 0) return null;
    return this.bonusRng.frac() < BONUS_CHANCE ? this.bonusRng.pick(['chase', 'escape']) : null;
  }

  // The shop, or after wave 50 the go-home-or-endless choice.
  afterLevel() {
    if (this.stage === FINAL_STAGE && !this.endless) openChoice(this);
    else openShop(this);
  }

  afterShop() {
    this.startStage(this.stage + 1);
  }

  // Bonus level: a longer vehicle stage between levels, seen from the side. Riders keep coming for BONUS_TIME and
  // each one taken down pays out at the end. Hits can't cost HP here, only coins.
  startBonus(mode) {
    this.bonus = { mode, caught: 0, endsAt: Infinity };
    this.updateHud();
    this.setView('side', mode);
    this.banner(`BONUS LEVEL\n\n${mode === 'chase' ? 'CHASE THEM DOWN!\nSHOOT AHEAD' : 'ESCAPE!\nSHOOT BEHIND'}`, 2200, 22);
    this.time.delayedCall(2400, () => {
      this.bonus.endsAt = this.t + BONUS_TIME;
      this.nextRider = this.t;
      this.nextDive = this.t + 3000;
      this.nextObstacle = this.t + 1500;
    });
  }

  endBonus() {
    const b = this.bonus;
    this.bonus = null;
    for (const e of this.enemies.getChildren().slice()) { this.sparks.explode(8, e.x, e.y); e.destroy(); } // the rest peel away
    for (const p of this.pickups.getChildren().slice()) this.collect(p); // coins still on the road are yours
    this.clearShots();
    this.obstacles.clear(true, true);
    const pay = b.caught * BONUS_PAY;
    this.addCoins(pay);
    jingle([523, 659, 784, 1046, 1318]);
    this.banner(`BONUS COMPLETE\n\n${b.caught} RIDERS\n+$${Math.floor(pay * this.P.coinMult)}`, 2400, 22);
    this.time.delayedCall(2600, () => this.afterLevel());
  }

  spawnStage(s) {
    const st = STAGES[s];
    this.spawnsLeft = st.stream ? st.stream.join('').length : 0;
    if (st.formation) this.formation(st.formation);
    if (st.stream) this.stream(st.stream, st.formation ? 2500 : 0);
    this.nextCharge = this.t + 2500;
    this.waveActive = true;
  }

  // One soldier of this timeline's army. `role` is a ROLES letter: it picks the sprite and the health.
  spawnEnemy(x, y, role, props) {
    const hp = this.enemyHp() * ROLES[role].hp;
    return Object.assign(this.enemies.create(x, y, this.E.army[role]), { role, hp, maxHp: hp }, props);
  }

  // A grid that flies in, then sways side to side. `rows` are strings of ROLES letters, '.' for a gap.
  formation(rows) {
    const sx = 70, sy = 62, cols = Math.max(...rows.map(r => r.length)), left = W / 2 - (cols - 1) * sx / 2;
    let n = 0;
    rows.forEach((row, r) => [...row].forEach((role, c) => {
      if (role === '.') return;
      const e = this.spawnEnemy(W / 2, -60, role, {
        mode: 'formation', homeX: left + c * sx, homeY: 130 + r * sy, fromX: Phaser.Math.Between(0, W), fromY: -60 - r * 40, enter: 0,
      });
      this.tweens.add({ targets: e, enter: 1, delay: n++ * 45, duration: 1100, ease: 'Sine.easeOut' });
    }));
  }

  // Lines of soldiers snaking down the screen, one string of ROLES letters per line; any that get past just leave.
  stream(lines, delay = 0) {
    this.streamTimers = [];
    lines.forEach((line, s) => [...line].forEach((role, i) => {
      this.streamTimers.push(this.time.delayedCall(delay + s * 2600 + i * 260, () => {
        this.spawnEnemy(W / 2, -40, role, { mode: 'stream', age: 0, side: s % 2 ? -1 : 1, phase: s * 0.9 });
        this.spawnsLeft--;
      }));
    }));
  }

  // One rider in a bonus level: from ahead in a chase (they look back to shoot at you) or from behind in an escape.
  // They weave about and now and then try to ram you.
  spawnRider(mode) {
    const chase = mode === 'chase', y = Phaser.Math.Between(BAND_TOP + 20, H - 50), x0 = chase ? W + 70 : -70;
    const e = this.spawnEnemy(x0, y, 'G', {
      mode: 'ride', fromX: x0, homeX: chase ? Phaser.Math.Between(330, W - 60) : Phaser.Math.Between(60, 270), baseY: y, phase: Math.random() * 6, enter: 0,
    });
    e.hp = e.maxHp = this.enemyHp() + 1; // riders are tougher than foot soldiers
    e.play(`rideE-${this.E.id}-${chase ? 'b' : 'f'}`);
    e.body.setSize(e.width * 0.6, e.height * 0.55, true);
    this.tweens.add({ targets: e, enter: 1, duration: 1400, ease: 'Sine.easeOut' });
  }

  // A boss flies in, says its line, then fights in phases (see ERAS: `phases`, `taunts`, `move`).
  spawnBoss(main) {
    const cfg = main ? this.E.boss : this.E.mid;
    this.banner(cfg.name, 2200, 26);
    const b = this.boss = this.physics.add.sprite(W / 2, -150, `${cfg.key}0`).setDepth(1).play(`${cfg.key}-idle`);
    b.body.setSize(b.width * 0.8, b.height * 0.8);
    Object.assign(b, { cfg, main, ready: false, phase: 0, step: 0, stream: null, charging: false, nextBlink: 0, sweepDir: 1 });
    b.maxHp = b.hp = this.bossHp(main);
    this.tweens.add({ targets: b, y: 180, duration: 2200, ease: 'Sine.easeOut', onComplete: () => {
      Object.assign(b, { ready: true, readyAt: this.et, nextAttack: this.t + 900, nextBlink: this.t + 3500 });
      this.say(b, cfg.taunts[0]);
    } });
    this.bossColliders = [
      this.physics.add.overlap(b, this.bullets, (boss, bullet) => this.bulletHit(bullet, boss)),
      this.physics.add.overlap(this.player, b, () => this.hitPlayer()),
    ];
    this.bossBar = this.add.graphics().setDepth(10);
  }

  // A boss's line, under it for a couple of seconds.
  say(b, text) {
    if (!text) return;
    this.lastTaunt = text;
    const t = this.add.text(W / 2, 180 + b.displayHeight / 2 + 22, `"${text}"`, {
      fontFamily: FONT, fontSize: '12px', color: '#ffffff', align: 'center', stroke: '#000000', strokeThickness: 4, lineSpacing: 6, wordWrap: { width: W - 80 },
    }).setOrigin(0.5, 0).setDepth(10);
    this.tweens.add({ targets: t, alpha: 0, delay: 2400, duration: 400, onComplete: () => t.destroy() });
  }

  // The boss's hurt pose for a moment, then back to its idle animation.
  hurt(b, ms) {
    if (!b.active) return;
    b.anims.stop();
    b.setTexture(`${b.cfg.key}Hurt`);
    b.hurtTimer?.remove();
    b.hurtTimer = this.time.delayedCall(ms, () => b.active && b === this.boss && b.play(`${b.cfg.key}-idle`));
  }

  // ----- Vega's shooting -----
  // Damage right now: Aquila Standard adds a bonus while at full HP.
  // Bushido adds a bonus on your last HP.
  dmgNow() {
    const P = this.P;
    return P.dmg * (this.hp >= P.maxHp ? 1 + P.fullHpDmg : 1) * (this.hp === 1 ? 1 + P.lowHpDmg : 1);
  }

  // Berserker Rage: shoot faster the more HP you're missing (never more than about 3x). Nitro: 3x for 5 s.
  fireDelay() {
    return this.P.fireDelay * Math.max(0.35, 1 - this.P.berserk * (this.P.maxHp - this.hp)) / (this.t < this.nitroUntil ? 3 : 1);
  }

  moveSpeed() {
    return this.P.moveSpeed * (this.t < this.nitroUntil ? 2 : 1);
  }

  // On foot, a forgiving hitbox: just Vega's shoulders and cap. Sized from the sprite, so your own art works too.
  footHitbox() {
    const p = this.player;
    p.body.setSize(p.width * 0.43, p.height * 0.375, false).setOffset(p.width * 0.285, p.height * 0.475);
  }

  // Where shots leave from: the pistol's muzzle (above Vega on foot; ahead of or behind his ride in a vehicle).
  muzzle() {
    const p = this.player;
    return this.view === 'side'
      ? { x: p.x + Math.cos(this.aim) * p.width * 0.45, y: p.y - p.height * 0.1 }
      : { x: p.x, y: p.y - p.height * 0.475 };
  }

  fire() {
    const P = this.P, aim = this.aim, { x, y } = this.muzzle();
    if (this.t >= this.nextFire) {
      this.nextFire = this.t + this.fireDelay();
      this.volleys++;
      for (let i = 0; i < P.shots; i++) { // Extra Barrel fans the shots out
        this.spawnBullet(x, y, 'laser', aim + (i - (P.shots - 1) / 2) * 0.12, { dmg: this.dmgNow(), pierce: P.pierce, bounce: P.bounce, home: P.homing });
      }
      if (P.sixShooter && this.volleys % 6 === 0) { // Six-Shooter: a wide fan every 6th shot
        for (let i = 0; i < P.sixShooter; i++) {
          this.spawnBullet(x, y, 'laser', aim - 0.6 + 1.2 * i / (P.sixShooter - 1), { dmg: this.dmgNow(), pierce: P.pierce, bounce: P.bounce });
        }
      }
      if (P.longbowEvery && this.volleys % P.longbowEvery === 0) {
        this.spawnBullet(x, y, 'arrowUp', aim, { dmg: 3 * this.dmgNow(), pierce: 99, bounce: P.bounce, speed: 900 });
      }
      if (this.volleys % 2 === 0) {
        this.partners.forEach((pt, i) => {
          // On foot partners shoot from beside Vega; in a vehicle they ride along and shoot from just above/below him.
          const px = this.view === 'side' ? x : pt.x, py = this.view === 'side' ? y + (i % 2 ? 28 : -28) : pt.y - 24;
          this.spawnBullet(px, py, P.partnerPierce ? 'arrowUp' : 'laser', aim, { dmg: P.partnerDmg * P.dmg, pierce: P.partnerPierce, bounce: 0 });
        });
      }
    }
    if (P.cannons && this.t >= this.nextCannon) {
      this.nextCannon = this.t + 2000 / P.cannons;
      this.spawnBullet(x, y, 'cannonball', aim, { dmg: 3 * this.dmgNow(), pierce: 0, bounce: P.cannonBounce, explode: P.cannonRadius, cannon: true, speed: 430, scale: 2 });
      boom(70, 0.04);
    }
    if (P.axes && this.t >= this.nextAxe) { // Throwing Axes: spin through everything (and come back with Returning Axes)
      this.nextAxe = this.t + 1500 / P.axes;
      const a = this.spawnBullet(x, y, 'axe', aim, { dmg: 2 * this.dmgNow(), pierce: 99, bounce: 0, speed: 480, scale: 2.4 });
      Object.assign(a, { spin: 900, returnAt: P.axesReturn ? this.t + 600 : 0 });
    }
    if (P.boomerangs && this.t >= this.nextBoomerang) { // Bone Boomerang: out and back
      this.nextBoomerang = this.t + 2000 / P.boomerangs;
      const b = this.spawnBullet(x, y, 'boomerang', aim + (Math.random() - 0.5) * 0.6, { dmg: 1.5 * this.dmgNow(), pierce: 99, bounce: 0, speed: 520, scale: 1.6 });
      Object.assign(b, { spin: 720, returnAt: this.t + 650 });
    }
    if (P.molotovs && this.t >= this.nextMolotov) { // Molotov: a spinning bottle that bursts into flames
      this.nextMolotov = this.t + 3000 / P.molotovs;
      this.spawnBullet(x, y, 'molotov', aim, { dmg: 2 * this.dmgNow(), pierce: 0, bounce: 0, explode: 80, burns: true, speed: 380, scale: 1.4 }).spin = 600;
    }
    if (P.drills && this.t >= this.nextDrill) { // Plasma Drill: a bolt that pierces everything
      this.nextDrill = this.t + 1200 / P.drills;
      this.spawnBullet(x, y, 'drillbolt', aim, { dmg: 4 * this.dmgNow(), pierce: 99, bounce: 0, speed: 800, scale: 1.4 });
    }
    if (P.torpedoes && this.t >= this.nextTorpedo) { // Photon Torpedo: homes in on an enemy and explodes
      this.nextTorpedo = this.t + 2500 / P.torpedoes;
      this.spawnBullet(x, y, 'torpedo', aim, { dmg: 4 * this.dmgNow(), pierce: 0, bounce: 0, explode: 70, home: 5, speed: 380, scale: 1.4 });
      beep(1000, 60, 0.03);
    }
    if (this.drones.length && this.t >= this.nextDrone) { // Drone Buddy: each drone shoots at the nearest enemy
      this.nextDrone = this.t + P.droneDelay;
      for (const d of this.drones) {
        const tgt = this.nearestFoe(d.x, d.y);
        if (tgt) this.spawnBullet(d.x, d.y, 'laser', Math.atan2(tgt.y - d.y, tgt.x - d.x), { dmg: 0.8 * this.dmgNow(), pierce: 0, bounce: 0 });
      }
    }
  }

  // Shots have to read on every road, light or dark: each shot sprite gets a copy wrapped in a soft glow, a bright ring
  // and a dark ring (pink for enemy shots, cyan for Vega's, so you can also tell them apart: pink stands out from every
  // road's colors). Made once per sprite and color, from whatever image the sprite has (your own PNGs too). It's only
  // looks: hitboxes stay the sprite's own size.
  glowTexture(tex, color) {
    const key = `${tex}~${color.toString(16)}`, m = SHOT_GLOW;
    if (this.textures.exists(key)) return key;
    const src = this.textures.get(tex).getSourceImage(), w = src.width, h = src.height, css = `#${color.toString(16).padStart(6, '0')}`;
    const silhouette = fill => { // the sprite's shape in one color
      const c = document.createElement('canvas'), ctx = c.getContext('2d');
      Object.assign(c, { width: w, height: h });
      ctx.drawImage(src, 0, 0);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = fill;
      ctx.fillRect(0, 0, w, h);
      return c;
    };
    const bright = silhouette(css), dark = silhouette('#140a26');
    const ring = (img, r) => { for (let a = 0; a < 16; a++) ctx.drawImage(img, m + Math.round(Math.cos(a * Math.PI / 8) * r), m + Math.round(Math.sin(a * Math.PI / 8) * r)); };
    const c = document.createElement('canvas'), ctx = c.getContext('2d');
    Object.assign(c, { width: w + 2 * m, height: h + 2 * m });
    ctx.shadowColor = css;
    ctx.shadowBlur = m;
    ring(bright, 2); // glow
    ctx.shadowBlur = 0;
    ring(bright, 3); // bright ring...
    ring(dark, 1.5); // ...around a dark one
    ctx.drawImage(src, m, m);
    this.textures.addCanvas(key, c);
    return key;
  }

  // Angle in radians: -PI/2 is straight up.
  spawnBullet(x, y, tex, angle, o) {
    const speed = o.speed ?? this.P.bulletSpeed;
    const b = this.bullets.create(x, y, this.glowTexture(tex, 0x4ff0ff)).setRotation(angle + Math.PI / 2).setScale(o.scale ?? 1);
    b.body.setSize(b.width - 2 * SHOT_GLOW, b.height - 2 * SHOT_GLOW);
    b.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    return Object.assign(b, { dmg: o.dmg, pierce: o.pierce, bounce: o.bounce, explode: o.explode ?? 0, cannon: !!o.cannon, burns: !!o.burns, home: o.home ?? 0, hits: new Set() });
  }

  // A shot hits an enemy or the boss. Piercing shots keep going; each shot hits a given target once per bounce.
  bulletHit(b, target) {
    if (!b.active || !target.active || b.hits.has(target)) return;
    const isBoss = target === this.boss;
    if (isBoss && !target.ready) return void b.destroy(); // can't be hurt while arriving
    b.hits.add(target);
    if (this.P.burn) this.ignite(target);
    this.damage(target, b.dmg, isBoss, b.cannon);
    if (b.explode) this.explode(b.x, b.y, b.explode, b.dmg, b.cannon, b.burns);
    if (b.pierce > 0) b.pierce--;
    else b.destroy();
  }

  // `quiet` is for burning: no crits, flashes or sounds every frame.
  damage(target, d, isBoss, cannon = false, quiet = false) {
    if (!target.active || target.hp <= 0) return;
    const P = this.P;
    if (isBoss) d *= P.bossDmg * (cannon ? P.cannonBossMult : 1);
    if (!quiet && Math.random() < P.crit) {
      d *= isBoss && P.bossCritMult ? P.bossCritMult : P.critMult;
      this.toast('CRIT', target.x, target.y - 24, '#ffd23b');
    }
    target.hp -= d;
    if (isBoss && !quiet) this.addCharge(0.1); // hits on a boss charge the active item too
    if (isBoss && !quiet && target.hp > 0 && !(target.hurtAt > this.t)) { target.hurtAt = this.t + 1000; this.hurt(target, 180); }
    if (target.hp <= 0) return isBoss ? this.bossDown() : this.killEnemy(target, true);
    if (quiet) return;
    target.setTintFill(0xffffff);
    this.time.delayedCall(50, () => target.active && target.clearTint());
    if (!isBoss) beep(620, 25, 0.03);
  }

  // Fire: set something burning for 3 s (it glows orange; see update()).
  ignite(target) {
    target.burnUntil = this.t + 3000;
  }

  isOnScreen(e) {
    return e.active && e.x > 0 && e.x < W && e.y > 0 && e.y < H;
  }

  // Cannonball (or dynamite, meteor, trebuchet) blast: hurts everything within r; Wildfire blasts also set it alight.
  explode(x, y, r, dmg, cannon, burns = false) {
    const ring = this.add.circle(x, y, r, 0xffd23b, 0.35).setDepth(3);
    this.tweens.add({ targets: ring, scale: 1.3, alpha: 0, duration: 250, onComplete: () => ring.destroy() });
    this.sparks.explode(20, x, y);
    boom(160, 0.08);
    for (const e of this.enemies.getChildren().slice()) {
      if (Phaser.Math.Distance.Between(x, y, e.x, e.y) < r) {
        if (burns) this.ignite(e);
        this.damage(e, dmg, false);
      }
    }
    if (this.boss?.ready && Phaser.Math.Distance.Between(x, y, this.boss.x, this.boss.y) < r + this.boss.displayWidth * 0.35) this.damage(this.boss, dmg, true, cannon);
  }

  // Enemy shots and boss lane attacks vanish (Siren, Petal Storm, a new view, a boss going down...).
  clearShots() {
    this.enemyShots.clear(true, true);
    for (const hz of this.hazards) hz.bar.destroy();
    this.hazards = [];
  }

  // ----- Enemies -----
  // Angle is measured from straight down: 0 = down, positive = towards the right.
  shoot(x, y, tex, speed, angle) {
    const s = this.enemyShots.create(x, y, this.glowTexture(tex, 0xff4fd8));
    s.body.setSize(s.width - 2 * SHOT_GLOW, s.height - 2 * SHOT_GLOW);
    s.setVelocity(Math.sin(angle) * speed, Math.cos(angle) * speed).setRotation(-angle);
  }

  angleToPlayer(x, y) {
    return Math.atan2(this.player.x - x, this.player.y - y);
  }

  killEnemy(e, byPlayer) {
    this.sparks.explode(14, e.x, e.y);
    boom(90);
    if (byPlayer) {
      if (this.bonus) this.bonus.caught++;
      this.addScore(100 * (this.era + 1) * ROLES[e.role].score);
      this.addCharge(1);
      if (this.P.dynamite) { // Dynamite: it blows up a moment later, maybe taking its neighbours with it
        const { x, y } = e;
        this.time.delayedCall(90, () => this.explode(x, y, this.P.dynamite, 2 * this.dmgNow(), false, this.P.dynamiteBurns));
      }
      const roll = Math.random(), coin = COIN_CHANCE * this.P.coinChance; // Scavenger doubles it
      if (roll < coin || ROLES[e.role].coin) this.drop('coin', e.x, e.y);
      else if (roll < coin + 0.03) this.drop('donut', e.x, e.y); // rare: heals 1 HP
    }
    e.destroy();
  }

  bossDown() {
    const b = this.boss;
    this.boss = null;
    this.bossColliders.forEach(c => c.destroy());
    this.bossBar.destroy();
    b.disableBody(false, false);
    this.tweens.killTweensOf(b);
    b.setAlpha(1).anims.stop();
    b.hurtTimer?.remove();
    b.setTexture(`${b.cfg.key}Hurt`);
    this.clearShots();
    for (const e of this.enemies.getChildren().slice()) { this.sparks.explode(8, e.x, e.y); e.destroy(); } // its soldiers flee
    this.addScore((b.main ? 5000 : 2500) * (this.era + 1));
    this.cameras.main.shake(700, 0.015);
    for (let i = 0; i < 7; i++) {
      this.time.delayedCall(i * 120, () => {
        this.sparks.explode(30, b.x + Phaser.Math.Between(-45, 45), b.y + Phaser.Math.Between(-35, 35));
        boom(220, 0.1);
      });
    }
    this.time.delayedCall(900, () => {
      this.coinBurst(b.x, b.y, b.main ? 25 : 12);
      if (b.main && !this.endless) this.drop('part', b.x, b.y); // collecting it leads on to the shop and the next timeline
      else { // mid-boss (or any boss in endless): coffee for a full heal, then the shop
        this.drop('coffee', b.x, b.y);
        this.time.delayedCall(2200, () => this.levelCleared());
      }
      b.destroy();
    });
  }

  drop(type, x, y) {
    const p = this.pickups.create(x, y, type);
    p.type = type;
    if (type === 'coin' || type === 'donut') { // fall down the road, or in a vehicle stage drift over towards Vega
      if (this.view === 'side') p.setVelocityX(Math.sign(this.player.x - x) * 110);
      else p.setVelocityY(120);
    }
    return p;
  }

  coinBurst(x, y, n) {
    for (let i = 0; i < n; i++) {
      this.drop('coin', x + Phaser.Math.Between(-50, 50), y + Phaser.Math.Between(-30, 30)).setVelocity(Phaser.Math.Between(-80, 80), Phaser.Math.Between(-40, 100));
    }
  }

  collect(p) {
    const type = p.type;
    p.destroy();
    if (type === 'coin') {
      this.addCoins(1);
      beep(1500, 25, 0.02);
    } else if (type === 'donut') {
      this.hp = Math.min(this.hp + 1, this.P.maxHp);
      this.toast('+1 HP', this.player.x, this.player.y - 50, '#ff4fd8');
      beep(1200, 50);
    } else if (type === 'coffee') {
      this.hp = this.P.maxHp;
      this.banner('COFFEE BREAK!\nFULL HP', 1200, 18);
      jingle([523, 784, 1046]);
    } else if (type === 'part') {
      this.parts++;
      this.addScore(2000);
      jingle([523, 659, 784, 1046]);
      this.banner(`GOT THE\n${this.E.part}!\n\nTIME DRIVE ${this.parts}/${TIMELINES}`, 2800);
      // Then the shop and the next timeline (after the 5th part, the go-home-or-endless choice).
      this.time.delayedCall(3100, () => this.levelCleared());
    }
    this.updateHud();
  }

  // Returns true if something hit Vega (even if the shield or armor stopped the damage), false while he's immune.
  hitPlayer() {
    if (!this.player.active || this.t < this.invulnUntil) return false;
    if (this.shield > 0) {
      this.shield--;
      this.invulnUntil = this.t + 600;
      this.toast('BLOCKED', this.player.x, this.player.y - 50, '#4ff0ff');
      beep(900, 80);
      this.updateHud();
      return true;
    }
    if (Math.random() < this.P.armor) {
      this.invulnUntil = this.t + 600;
      this.toast('CLANG!', this.player.x, this.player.y - 50, '#c8c8d4');
      beep(700, 60);
      return true;
    }
    if (this.bonus) { // bonus levels can't cost HP: you drop some coins instead
      const lost = Math.min(Math.floor(this.coins), 2 * BONUS_PAY);
      this.coins -= lost;
      this.invulnUntil = this.t + 1000;
      this.toast(lost ? `-$${lost}` : 'OOF', this.player.x, this.player.y - 50, '#ffd23b');
      this.cameras.main.shake(200, 0.008);
      boom(200, 0.08);
      this.tweens.add({ targets: this.player, alpha: 0.25, duration: 120, yoyo: true, repeat: 3, onComplete: () => this.player.setAlpha(1) });
      this.updateHud();
      return true;
    }
    this.hp--;
    this.sparks.explode(30, this.player.x, this.player.y);
    boom(450, 0.12);
    this.cameras.main.shake(260, 0.012);
    this.updateHud();
    if (this.hp <= 0) {
      this.player.disableBody(true, true);
      for (const pt of this.partners) pt.setVisible(false);
      this.sparks.explode(60, this.player.x, this.player.y);
      this.time.delayedCall(1300, () => endGame(false, this));
      return true;
    }
    this.invulnUntil = this.t + this.P.invuln;
    this.tweens.add({ targets: this.player, alpha: 0.25, duration: 120, yoyo: true, repeat: Math.max(1, Math.round(this.P.invuln / 240) - 1), onComplete: () => this.player.setAlpha(1) });
    return true;
  }

  // The drive is fixed: one last time jump home to 1986, and Vega walks off up the street.
  victory() {
    this.setView('top'); // back on foot after the last bonus level
    this.invulnUntil = Infinity;
    this.banner('TIME DRIVE\nFIXED!', 1600, 26);
    this.time.delayedCall(1700, () => {
      jingle([392, 523, 659, 784, 1046]);
      this.tweens.add({ targets: this.road, alpha: 0, duration: 300 });
      this.setStreaks(true, 0xff4fd8);
    });
    this.time.delayedCall(3100, () => {
      this.road.setTexture('road-1986');
      this.cameras.main.setBackgroundColor(0x140a26);
      this.tweens.add({ targets: this.road, alpha: 1, duration: 300 });
      this.setStreaks(false);
      this.banner('NEON CITY\n1986', 1800, 28);
      this.tweens.add({ targets: [this.player, ...this.partners, ...this.drones], y: -120, delay: 600, duration: 2200 });
    });
    this.time.delayedCall(5600, () => endGame(true, this));
  }

  // ----- Controls -----
  // Mouse: Vega heads for the pointer. Touch: the target moves by however far the finger drags, so the finger never
  // has to cover the character. Either way Vega walks there at his move speed (Running Shoes make it faster).
  steer(e) {
    if (app.state !== 'playing' || !this.playing || !this.player?.active) return;
    const r = this.game.canvas.getBoundingClientRect(), k = W / r.width;
    if (e.pointerType === 'mouse') {
      this.setTarget((e.clientX - r.left) * k, (e.clientY - r.top) * k);
    } else if (drag) {
      this.setTarget(this.target.x + (e.clientX - drag.x) * k * 1.4, this.target.y + (e.clientY - drag.y) * k * 1.4);
      drag.x = e.clientX;
      drag.y = e.clientY;
    }
  }

  // Where Vega may go: the lower half on foot; in a vehicle, the ground band, on his half of it
  // (left when chasing, right when being chased, so there's room to see what's coming).
  setTarget(x, y) {
    if (this.view === 'side') {
      const chase = this.sideMode === 'chase';
      this.target.x = Phaser.Math.Clamp(x, chase ? 60 : W * 0.5, chase ? W * 0.5 : W - 60);
      this.target.y = Phaser.Math.Clamp(y, BAND_TOP, H - 34);
    } else {
      this.target.x = Phaser.Math.Clamp(x, 35, W - 35);
      this.target.y = Phaser.Math.Clamp(y, H * 0.5, H - 44);
    }
  }

  // Put Vega somewhere instantly (used by the playtest bot).
  placePlayer(x, y) {
    this.setTarget(x, y);
    this.player.setPosition(this.target.x, this.target.y);
  }

  // ----- Every frame -----
  update(_, delta) {
    const dt = delta / 1000;
    this.road.tilePositionY -= ROAD_SPEED * dt;
    if (this.view === 'side') { // racing right: the ground rushes left, the hills drift
      this.ground.tilePositionX += GROUND_SPEED * dt;
      this.hills.tilePositionX += GROUND_SPEED * 0.15 * dt;
    }
    for (const s of this.streaks) {
      s.y += s.speed * dt;
      if (s.y > H + 20) { s.y = -20; s.x = Phaser.Math.Between(0, W); }
    }
    if (!this.playing) return;
    this.t += delta;
    const frozen = this.t < this.frozenUntil;
    if (!frozen) this.et += delta;
    const P = this.P;

    if (this.player.active && app.state === 'playing') {
      const k = this.keys;
      const kx = (k.RIGHT.isDown || k.D.isDown) - (k.LEFT.isDown || k.A.isDown);
      const ky = (k.DOWN.isDown || k.S.isDown) - (k.UP.isDown || k.W.isDown);
      const speed = this.moveSpeed();
      if (kx || ky) this.setTarget(this.target.x + kx * speed * dt, this.target.y + ky * speed * dt);
      const dx = this.target.x - this.player.x, dy = this.target.y - this.player.y, dist = Math.hypot(dx, dy), step = speed * dt;
      if (dist > step) this.player.setPosition(this.player.x + dx / dist * step, this.player.y + dy / dist * step);
      else this.player.setPosition(this.target.x, this.target.y);
      this.fire();
    }

    // Partners walk beside Vega, one on each side.
    this.partners.forEach((pt, i) => {
      const ease = Math.min(1, dt * 8);
      pt.x += (this.player.x + pt.side * 62 - pt.x) * ease; // on its own side (left or right companion slot)
      pt.y += (this.player.y + 14 - pt.y) * ease;
    });
    // Drones hover over him, drifting side to side.
    this.drones.forEach((d, i) => {
      const ease = Math.min(1, dt * 5), a = this.t / 600 + i * Math.PI;
      d.x += (this.player.x + d.side * 46 + Math.cos(a) * 14 - d.x) * ease;
      d.y += (this.player.y - 70 + Math.sin(a) * 12 - d.y) * ease;
      d.setVisible(this.player.active);
    });

    // Scutum: recharge one shield charge at a time.
    if (this.shield < P.shieldMax) {
      if (this.t >= this.shieldNextAt) { this.shield++; this.shieldNextAt = this.t + P.shieldRecharge; this.updateHud(); }
    } else this.shieldNextAt = this.t + P.shieldRecharge;
    this.shieldRing.clear();
    if (this.player.active && this.t < this.testudoUntil) this.shieldRing.lineStyle(5, 0xffd23b, 0.8).strokeCircle(this.player.x, this.player.y + 8, 50);
    if (this.shield > 0 && this.player.active) this.shieldRing.lineStyle(3, 0x4ff0ff, 0.6).strokeCircle(this.player.x, this.player.y + 8, 44);
    if (this.player.active && this.t < this.nitroUntil) this.shieldRing.lineStyle(4, 0xff8a2a, 0.8).strokeCircle(this.player.x, this.player.y + 8, 56);

    // Enemy tints: blue while the Siren has them frozen (they stand still and don't shoot), orange while burning.
    // Burning (Fire, Molotov, Wildfire) does steady damage for its 3 s, more with more copies of Fire.
    for (const e of [...this.enemies.getChildren(), this.boss].filter(Boolean)) {
      const burning = e.burnUntil > this.t, tint = frozen ? 0x88ccff : burning ? 0xff9944 : 0;
      if (tint) e.setTint(tint);
      else if (e.isTinted && (e.tintTopLeft === 0x88ccff || e.tintTopLeft === 0xff9944)) e.clearTint();
      if (burning) this.damage(e, 2 * Math.max(1, P.burn) * P.dmg * dt, e === this.boss, false, true);
    }
    if (!frozen) {
      this.updateEnemies(dt);
      this.updateBoss(dt);
    } else if (this.boss) this.drawBossBar();
    for (const hz of this.hazards.slice()) { // a boss's lane attack: anyone standing in the column gets hit
      if (this.t >= hz.until) { hz.bar.destroy(); this.hazards.splice(this.hazards.indexOf(hz), 1); }
      else if (this.player.active && this.player.x > hz.x0 && this.player.x < hz.x1) this.hitPlayer();
    }
    this.hpBars.clear();
    for (const e of this.enemies.getChildren()) { // soldiers that take more than one hit show how worn down they are
      if (e.hp >= e.maxHp || e.maxHp <= P.dmg) continue;
      const x = e.x - 17, y = e.y - e.displayHeight / 2 - 8;
      this.hpBars.fillStyle(0x000000, 0.7).fillRect(x - 1, y - 1, 36, 6).fillStyle(0xff3b3b).fillRect(x, y, 34 * Math.max(0, e.hp) / e.maxHp, 4);
    }

    // Ricochet: shots bounce off the screen edges (on foot: sides and top; in a vehicle: all round the ground band).
    const top = this.view === 'side' ? BAND_TOP - 40 : 6, bottom = this.view === 'side' ? H - 6 : Infinity;
    for (const b of this.bullets.getChildren()) {
      if (b.bounce <= 0) continue;
      const v = b.body.velocity;
      let bounced = false;
      if ((b.x < 6 && v.x < 0) || (b.x > W - 6 && v.x > 0)) { v.x = -v.x; bounced = true; }
      if ((b.y < top && v.y < 0) || (b.y > bottom && v.y > 0)) { v.y = -v.y; bounced = true; }
      if (bounced) { b.bounce--; b.hits.clear(); b.setRotation(Math.atan2(v.y, v.x) + Math.PI / 2); }
    }
    for (const b of this.bullets.getChildren().slice()) {
      if (b.home) { // Smart Rounds and Photon Torpedoes turn towards the nearest enemy (b.home: radians per second)
        const tgt = this.nearestFoe(b.x, b.y, b.hits), v = b.body.velocity;
        if (tgt) {
          const a = Math.atan2(v.y, v.x), turn = Phaser.Math.Angle.Wrap(Math.atan2(tgt.y - b.y, tgt.x - b.x) - a);
          const na = a + Phaser.Math.Clamp(turn, -b.home * dt, b.home * dt), speed = v.length();
          v.set(Math.cos(na) * speed, Math.sin(na) * speed);
          b.setRotation(na + Math.PI / 2);
        }
      }
      if (b.spin) b.angle += b.spin * dt;
      if (b.returnAt && this.t > b.returnAt && this.player.active) { // boomerangs (and Returning Axes) fly back to Vega
        if (!b.returning) { b.returning = true; b.hits.clear(); }
        this.physics.moveToObject(b, this.player, 620);
        if (Phaser.Math.Distance.Between(b.x, b.y, this.player.x, this.player.y) < 30) b.destroy();
      }
    }

    // Shuriken Ring: stars circle Vega, cutting what they touch (each enemy at most every 0.4 s) and blocking shots.
    while (this.stars.length > P.orbitals) this.stars.pop().destroy(); // sold
    while (this.stars.length < P.orbitals) this.stars.push(this.add.image(0, 0, 'shuriken').setScale(2.5).setTint(0x4ff0ff).setDepth(3));
    this.orbitAngle += P.orbitSpeed * dt;
    this.stars.forEach((st, i) => {
      const a = this.orbitAngle + i * Math.PI * 2 / this.stars.length;
      st.setPosition(this.player.x + Math.cos(a) * P.orbitRadius, this.player.y + Math.sin(a) * P.orbitRadius).setVisible(this.player.active);
      st.angle += 600 * dt;
      if (!this.player.active) return;
      const near = (o, r) => Phaser.Math.Distance.Between(st.x, st.y, o.x, o.y) < r;
      for (const e of this.enemies.getChildren().slice()) {
        if (near(e, 32) && !(e.starCd > this.t)) { e.starCd = this.t + 400; this.damage(e, 1.5 * this.dmgNow(), false); }
      }
      if (this.boss?.ready && near(this.boss, this.boss.displayWidth * 0.45) && !(this.boss.starCd > this.t)) { this.boss.starCd = this.t + 400; this.damage(this.boss, 1.5 * this.dmgNow(), true); }
      for (const s of this.enemyShots.getChildren().slice()) if (near(s, 22)) s.destroy();
    });

    // Coins within magnet range (or every pickup once a stage is cleared) fly to Vega; coffee and parts always do.
    if (this.player.active) {
      for (const p of this.pickups.getChildren()) {
        const near = Phaser.Math.Distance.Between(p.x, p.y, this.player.x, this.player.y) < P.magnet;
        if (p.type === 'part' || p.type === 'coffee' || this.vacuum || (p.type === 'coin' && near)) this.physics.moveToObject(p, this.player, 420);
      }
    }
    for (const g of [this.bullets, this.enemyShots, this.pickups, this.obstacles]) {
      for (const o of g.getChildren().slice()) if (o.y < -50 || o.y > H + 50 || o.x < -80 || o.x > W + 80) o.destroy();
    }

    if (this.waveActive && this.spawnsLeft === 0 && this.enemies.countActive() === 0) this.waveCleared();

    // Bonus level: riders keep coming until the clock runs out (at most 6 on the road at once).
    const b = this.bonus;
    if (b && this.t < b.endsAt && this.t > this.nextRider && this.enemies.countActive() < 6) {
      this.nextRider = this.t + 1300 / ((1 + 0.2 * this.era) * this.diff.fire);
      this.spawnRider(b.mode);
    }
    if (b && this.t >= b.endsAt) this.endBonus();
    else if (b && Math.ceil((b.endsAt - this.t) / 1000) !== this.hudSecs) { this.hudSecs = Math.ceil((b.endsAt - this.t) / 1000); this.updateHud(); }
  }

  updateEnemies(dt) {
    const sway = Math.sin(this.et / 900) * 50, bob = Math.sin(this.et / 400) * 6;
    for (const e of this.enemies.getChildren().slice()) {
      if (e.mode === 'formation') {
        e.x = Phaser.Math.Linear(e.fromX, e.homeX + sway, e.enter);
        e.y = Phaser.Math.Linear(e.fromY, e.homeY + bob, e.enter);
      } else if (e.mode === 'stream') {
        e.age += dt;
        e.y = -40 + e.age * 150;
        e.x = W / 2 + e.side * Math.sin(e.age * 1.6 + e.phase) * W * 0.36;
        if (e.y > H + 40) e.destroy();
      } else if (e.mode === 'dive') { // a charger running at Vega
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        if (e.y > H + 40 && e.homeX === undefined) e.destroy(); // from a stream: gone
        else if (e.y > H + 40) { // from a formation: come back in from the top to its old spot
          Object.assign(e, { mode: 'formation', fromX: e.homeX, fromY: -60, enter: 0 });
          this.tweens.add({ targets: e, enter: 1, duration: 1200, ease: 'Sine.easeOut' });
        }
      } else if (e.mode === 'pulled') { // sucked into the Black Hole
        const ease = Math.min(1, dt * 3);
        e.x += (e.pullX - e.x) * ease;
        e.y += (e.pullY - e.y) * ease;
      } else if (e.mode === 'ride') { // weaving about their spot on the ground band
        e.x = Phaser.Math.Linear(e.fromX, e.homeX + Math.sin(this.et / 900 + e.phase) * 40, e.enter);
        e.y = Phaser.Math.Clamp(e.baseY + Math.sin(this.et / 650 + e.phase) * 70, BAND_TOP, H - 34);
      } else if (e.mode === 'ram') { // charging at Vega; once past him (or at the edge) they fall back into place
        e.x += e.vx * dt;
        e.y = Phaser.Math.Clamp(e.y + e.vy * dt, BAND_TOP, H - 34);
        const past = e.vx < 0 ? e.x < this.player.x - 140 || e.x < 30 : e.x > this.player.x + 140 || e.x > W - 30;
        if (past) {
          Object.assign(e, { mode: 'ride', fromX: e.x, baseY: e.y, enter: 0 });
          this.tweens.add({ targets: e, enter: 1, duration: 1400, ease: 'Sine.easeOut' });
        }
      }
      if (!e.active) continue;
      if (e.windup) { // a charger shaking before it charges
        if (this.et < e.windup) e.x += Phaser.Math.Between(-3, 3);
        else {
          const vy = 420;
          Object.assign(e, { windup: 0, mode: 'dive', vy, vx: (this.player.x - e.x) * vy / Math.max(200, this.player.y - e.y) });
          e.clearTint();
          beep(280, 90, 0.03);
        }
      }
      if (e.snipeAt && this.et >= e.snipeAt) { // a sharpshooter done aiming: a fast shot straight at Vega
        e.snipeAt = 0;
        e.clearTint();
        if (this.player.active) this.shoot(e.x, e.y + 20, this.E.shot, this.diff.shotSpeed * 1.4, this.angleToPlayer(e.x, e.y + 20));
      }
    }

    const pressure = (1 + 0.2 * this.era + 0.04 * ((this.stage - 1) % STAGES_PER_ERA)) * this.diff.fire;
    const side = this.view === 'side';
    if (!side && this.t > this.nextCharge) { // a charger picks its moment (in place, or partway down its stream)
      this.nextCharge = this.t + 1500 / this.diff.fire;
      const ready = x => x.role === 'C' && !x.windup && (x.mode === 'formation' ? x.enter === 1 : x.mode === 'stream' && x.y > 60 && x.y < H * 0.45);
      const e = Phaser.Utils.Array.GetRandom(this.enemies.getChildren().filter(ready));
      if (e && this.player.active) e.setTint(0xff5050).windup = this.et + 350;
    }
    const racing = side && this.bonus && this.t < this.bonus.endsAt;
    if (racing && this.t > this.nextDive) { // a rider tries to ram Vega
      this.nextDive = this.t + 2600 / pressure;
      const e = Phaser.Utils.Array.GetRandom(this.enemies.getChildren().filter(x => x.mode === 'ride' && x.enter === 1));
      if (e && this.player.active) {
        Object.assign(e, { mode: 'ram', vx: Math.sign(this.player.x - e.x) * 340, vy: (this.player.y - e.y) * 0.9 });
        beep(220, 120, 0.04);
      }
    }
    if (racing && this.t > this.nextObstacle) { // rocks or barrels come at you from ahead
      this.nextObstacle = this.t + Phaser.Math.Between(1100, 2000) / pressure;
      this.obstacles.create(W + 50, Phaser.Math.Between(BAND_TOP + 10, H - 40), this.E.obstacle).setVelocityX(-GROUND_SPEED).setDepth(1);
    }

    if (this.t > this.nextEnemyShot) {
      // fire gets faster with each timeline and with each stage inside it
      // (chargers never shoot; a sharpshooter already taking aim isn't picked again)
      const shooters = this.enemies.getChildren().filter(x => x.role !== 'C' && !x.snipeAt && (side ? x.x > 0 && x.x < W : x.y > 0 && x.y < H * 0.7));
      this.nextEnemyShot = this.t + (shooters.length ? 1000 : 300) / pressure;
      const e = Phaser.Utils.Array.GetRandom(shooters), shot = this.E.shot, speed = this.diff.shotSpeed;
      const lob = e && Phaser.Math.Clamp(this.angleToPlayer(e.x, e.y) * 0.5, -0.5, 0.5);
      // Riders aim straight at you. On foot, grunts lob shots roughly your way, heavies a spread of 3, and
      // sharpshooters flash red for a moment first, then aim properly (see above).
      if (e && side) this.shoot(e.x + Math.sign(this.player.x - e.x) * 24, e.y - 6, shot, speed, this.angleToPlayer(e.x, e.y));
      else if (e?.role === 'S') e.setTint(0xff5050).snipeAt = this.et + 450;
      else if (e?.role === 'H') for (const d of [-0.3, 0, 0.3]) this.shoot(e.x, e.y + 26, shot, speed * 0.9, lob + d);
      else if (e) this.shoot(e.x, e.y + 20, shot, speed, lob);
    }
  }

  drawBossBar() {
    const b = this.boss, bw = W - 120;
    this.bossBar.clear().fillStyle(0x000000, 0.6).fillRect(60, 64, bw, 12).fillStyle(0xff4fd8).fillRect(60, 64, bw * Math.max(0, b.hp) / b.maxHp, 12);
  }

  updateBoss(dt) {
    const b = this.boss;
    if (!b) return;
    this.drawBossBar();
    if (!b.ready) return;
    const cfg = b.cfg, range = W / 2 - b.displayWidth / 2 - 10, k = this.et - b.readyAt;

    // Moving: sway side to side, hover in a slow figure of eight, or vanish and reappear somewhere else.
    if (!b.charging) {
      if (cfg.move === 'teleport') {
        if (this.t > b.nextBlink) {
          b.nextBlink = this.t + 3800;
          this.tweens.add({ targets: b, alpha: 0, duration: 220, yoyo: true, onYoyo: () => { b.x = W / 2 + Phaser.Math.FloatBetween(-1, 1) * range; } });
        }
      } else {
        const hover = cfg.move === 'hover';
        const x = W / 2 + Math.sin(k / (hover ? 2100 : 1300)) * range * (hover ? 0.7 : 1), y = hover ? 180 + Math.sin(k / 800) * 18 : 180;
        const ease = Math.min(1, dt * 4); // eased, so it glides back into its path after a charge
        b.x += (x - b.x) * ease;
        b.y += (y - b.y) * ease;
      }
    }

    // A new phase at each threshold: a line, the hurt pose, a breather, then the next set of attacks.
    const n = cfg.phases.length, phase = Math.min(n - 1, Math.floor((1 - b.hp / b.maxHp) * n));
    if (phase > b.phase) {
      Object.assign(b, { phase, step: 0, stream: null, nextAttack: this.t + 1400 });
      this.hurt(b, 700);
      this.say(b, cfg.taunts[phase]);
      this.clearShots();
      jingle([392, 330, 262]);
    }

    // Shots fired over time (spiral, sweep, rain, aimed bursts) go out one tick at a time, so the Siren pauses them.
    const st = b.stream;
    if (st && this.t >= st.next) {
      st.fire(st.i++);
      st.next += st.every;
      if (st.i >= st.count) b.stream = null;
    }
    if (this.t > b.nextAttack && !b.stream && !b.charging) {
      const list = cfg.phases[b.phase], [name, arg] = list[b.step++ % list.length].split(':');
      const ms = this.bossAttack(b, name, arg);
      b.nextAttack = this.t + ms + (1000 - 200 * b.phase) / this.diff.fire;
    }
  }

  // One boss attack, by name (from the boss's `phases`; `arg` is the shot sprite, or for `summon` the soldier type).
  // Returns about how long it lasts in ms.
  bossAttack(b, name, arg) {
    const shot = arg || b.cfg.shot, sp = this.diff.shotSpeed / 250, x = () => b.x, y = () => b.y + b.displayHeight * 0.3;
    const ticks = (count, every, fire) => { b.stream = { count, every, i: 0, next: this.t, fire }; return count * every; };
    beep(180, 120, 0.04);
    switch (name) {
      case 'fan': { // a spread of shots
        const n = 5 + 2 * b.phase;
        for (let i = 0; i < n; i++) this.shoot(x(), y(), shot, 220 * sp, -0.8 + 1.6 * i / (n - 1));
        return 400;
      }
      case 'aimed': // a quick burst straight at Vega
        return ticks(3 + b.phase, 150, () => this.player.active && this.shoot(x(), y(), shot, 320 * sp, this.angleToPlayer(x(), y())));
      case 'ring': { // shots in every direction
        const n = 14 + 4 * b.phase, off = Math.random();
        for (let i = 0; i < n; i++) this.shoot(x(), b.y, shot, 200 * sp, (i + off) / n * Math.PI * 2);
        boom(140, 0.05);
        return 600;
      }
      case 'spiral': // two arms of shots turning round
        return ticks(24, 85, i => { for (const a of [0, Math.PI]) this.shoot(x(), b.y, shot, 190 * sp, i * 0.33 + a); });
      case 'sweep': { // a gun sweeping across the screen and back
        const dir = b.sweepDir = -b.sweepDir;
        return ticks(26, 60, i => this.shoot(x(), y(), shot, 300 * sp, dir * (-0.95 + 1.9 * i / 25)));
      }
      case 'wall': { // a row of shots coming down, with one gap to slip through
        const gap = Phaser.Math.Between(0, 10);
        for (let i = 0; i < 12; i++) if (i !== gap && i !== gap + 1) this.shoot(25 + i * 50, b.y + 40, shot, 170 * sp, 0);
        return 900;
      }
      case 'rain': // shots falling from the top of the screen
        return ticks(12, 110, () => this.shoot(Phaser.Math.Between(30, W - 30), -10, shot, 260 * sp, Phaser.Math.FloatBetween(-0.15, 0.15)));
      case 'mortar': { // lobbed at where Vega is (the landing spot is marked), bursting into stones
        const n = 2 + b.phase;
        for (let i = 0; i < n; i++) this.time.delayedCall(i * 350, () => this.boss === b && this.lob(b, shot, sp));
        return 1000 + n * 350;
      }
      case 'lanes': return this.lanes(b, 2 + b.phase);
      case 'charge': return this.bossCharge(b);
      case 'summon': return this.summon(arg || 'G', arg === 'H' ? 2 : 3 + b.phase);
    }
    return 0;
  }

  lob(b, tex, sp) {
    const tx = Phaser.Math.Clamp(this.player.x + Phaser.Math.Between(-50, 50), 40, W - 40);
    const ty = Phaser.Math.Clamp(this.player.y + Phaser.Math.Between(-40, 30), H * 0.5, H - 60);
    const mark = this.add.circle(tx, ty, 34, 0xff3b3b, 0.2).setStrokeStyle(2, 0xff3b3b, 0.8);
    const ball = this.add.image(b.x, b.y, this.glowTexture(tex, 0xff4fd8)).setDepth(5);
    const scale = ball.width - 2 * SHOT_GLOW < 30 ? 2 : 1; // small shots drawn bigger
    ball.setScale(scale);
    this.tweens.add({ targets: ball, scale: scale * 1.7, duration: 500, yoyo: true }); // up and down: the arc
    this.tweens.add({ targets: ball, x: tx, y: ty, angle: 360, duration: 1000, onComplete: () => {
      ball.destroy();
      mark.destroy();
      if (this.boss !== b) return;
      this.sparks.explode(16, tx, ty);
      boom(160, 0.06);
      for (let i = 0; i < 8; i++) this.shoot(tx, ty, 'stone', 190 * sp, i / 8 * Math.PI * 2);
    } });
  }

  // Some of the screen's 6 columns flash red, then something slams down them (a tentacle, a beam, a tail...).
  // At least 2 columns are always safe.
  lanes(b, n) {
    const w = W / 6, color = b.cfg.laneColor ?? 0xff4fd8;
    for (const c of Phaser.Utils.Array.Shuffle([0, 1, 2, 3, 4, 5]).slice(0, Math.min(n, 4))) {
      const x = c * w + w / 2, warn = this.add.rectangle(x, H / 2 + 60, w - 8, H, 0xff3b3b, 0.18);
      this.time.delayedCall(800, () => {
        warn.destroy();
        if (this.boss !== b) return;
        const bar = this.add.rectangle(x, H / 2 + 60, w - 16, H, color, 0.85).setDepth(0.5); // under the boss and Vega
        this.hazards.push({ x0: x - w / 2 + 8, x1: x + w / 2 - 8, until: this.t + 450, bar });
        this.cameras.main.shake(150, 0.006);
        boom(200, 0.06);
      });
    }
    return 1400;
  }

  // The boss shakes, then dashes down at Vega and back up (touching it hurts).
  bossCharge(b) {
    b.charging = true;
    this.tweens.add({ targets: b, x: b.x + 6, duration: 50, yoyo: true, repeat: 5, onComplete: () => {
      if (this.boss !== b) return;
      beep(160, 200, 0.05);
      const tx = Phaser.Math.Clamp(this.player.x, b.displayWidth / 2, W - b.displayWidth / 2), ty = Math.min(this.player.y - 40, H - 120);
      this.tweens.add({ targets: b, x: tx, y: ty, duration: 550, ease: 'Quad.easeIn', yoyo: true, hold: 200, onComplete: () => { b.charging = false; } });
    } });
    return 2000;
  }

  // The boss calls in a few soldiers of its army (at most 8 on screen).
  summon(role, n) {
    n = Math.min(n, 8 - this.enemies.countActive());
    for (let i = 0; i < n; i++) {
      const x = W / 2 + (i - (n - 1) / 2) * 80;
      const e = this.spawnEnemy(x, -40, role, { mode: 'formation', homeX: x, homeY: 340, fromX: x, fromY: -40, enter: 0 });
      this.tweens.add({ targets: e, enter: 1, delay: i * 80, duration: 900, ease: 'Sine.easeOut' });
    }
    return 1000;
  }
}

// Phaser draws text once, so wait (briefly) for the arcade font before starting the game.
Promise.race([document.fonts?.load(`16px ${FONT}`), new Promise(r => setTimeout(r, 2000))]).finally(() => {
  game = new Phaser.Game({
    type: Phaser.AUTO,
    width: W,
    height: H,
    backgroundColor: '#140a26',
    pixelArt: true,
    physics: { default: 'arcade' },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: Play,
  });
});
