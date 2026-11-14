// Rewind Patrol: the game scene. Loaded last (after data.js, art.js and ui.js).

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
    this.partners = [];

    // Everything about this run. The seeded generator rolls the shop, so the same seed gives the same offers.
    this.rng = new Phaser.Math.RandomDataGenerator([app.seed]);
    // The seed also picks this run's 5 timelines, and (past stage 50) the endless ones, on their own generators so
    // the shop rolls don't shift them around.
    this.route = new Phaser.Math.RandomDataGenerator([`${app.seed}/route`]).shuffle(ERAS.slice()).slice(0, TIMELINES);
    this.endlessRng = new Phaser.Math.RandomDataGenerator([`${app.seed}/endless`]);
    this.stars = []; // Shuriken Ring
    Object.assign(this, {
      score: 0, coins: 0, owned: {}, combos: [], parts: 0, best: store.get(bestKey(), 0), newBest: false,
      nextFire: 0, volleys: 0, nextCannon: 0, nextEnemyShot: 0, invulnUntil: 0, shieldNextAt: 0,
      waveActive: false, spawnsLeft: 0, divers: false, boss: null, vacuum: false, stage: 0, era: 0,
      target: { x: this.player.x, y: this.player.y },
      charge: 0, frozenUntil: 0, testudoUntil: 0, streamTimers: [], sideMode: null, nextObstacle: 0,
      nextAxe: 0, nextBoomerang: 0, orbitAngle: 0, chargeLockUntil: 0, endless: false,
      bonus: null, nextRider: 0, hudSecs: 0, // bonus levels
      et: 0, // enemy clock: like t, but it stops while the Siren has enemies frozen
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
    while (this.partners.length < stats.partners) this.partners.push(this.add.image(this.player.x, this.player.y, 'partner').setDepth(2));
    if (this.hp > stats.maxHp) this.hp = stats.maxHp;
    return unlocked;
  }

  // Called by the shop. Returns the combos the purchase unlocked (maybe none), or null if it couldn't be bought.
  buy(u) {
    const cost = priceOf(u, this.owned);
    if (this.coins < cost || (this.owned[u.id] || 0) >= u.max) return null;
    this.coins -= cost;
    if (u.active) { // one active item at a time: a new one replaces the old, starting uncharged
      for (const other of UPGRADES) if (other.active) delete this.owned[other.id];
      this.charge = 0;
    }
    this.owned[u.id] = (this.owned[u.id] || 0) + 1;
    const unlocked = this.refreshStats();
    if (u.heal) this.hp = Math.min(this.hp + u.heal, this.P.maxHp);
    if (u.id === 'scutum') this.shield = this.P.shieldMax;
    this.updateHud();
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
      this.enemyShots.clear(true, true);
      if (this.boss?.ready) this.damage(this.boss, 30 * this.dmgNow(), true);
    } else if (effect === 'skip') { // VCR Remote: this wave is over, on to the next
      this.banner('FAST FORWARD >>', 1200, 24);
      jingle([1046, 1318, 1568]);
      this.streamTimers.forEach(t => t.remove());
      this.spawnsLeft = 0;
      for (const e of this.enemies.getChildren().slice()) { this.sparks.explode(8, e.x, e.y); e.destroy(); }
      this.enemyShots.clear(true, true);
      this.waveCleared();
    } else if (effect === 'freeze') { // Siren: enemies stop, their shots vanish
      this.banner('SIREN!', 1000, 26);
      jingle([880, 660, 880, 660]);
      this.frozenUntil = this.t + 5000;
      this.enemyShots.clear(true, true);
    } else if (effect === 'invuln') { // Testudo
      this.banner('TESTUDO!', 1000, 26);
      this.testudoUntil = this.t + P.testudoMs;
      this.invulnUntil = Math.max(this.invulnUntil, this.testudoUntil);
      if (P.testudoShield) this.shield = P.shieldMax;
      jingle([523, 659, 784]);
    } else if (effect === 'trebuchet') { // a boulder lands on the boss (or where the enemies are) in a huge blast
      const foes = this.enemies.getChildren().filter(e => e.x > 0 && e.x < W && e.y > 0 && e.y < H);
      const avg = k => foes.reduce((sum, e) => sum + e[k], 0) / foes.length;
      const x = this.boss?.ready ? this.boss.x : foes.length ? avg('x') : W / 2;
      const y = this.boss?.ready ? this.boss.y : foes.length ? avg('y') : 260;
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
      this.enemyShots.clear(true, true);
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
    }
    this.charge = 0;
    this.chargeLockUntil = this.t + 3500; // its own kills (some land a moment later) don't refill it
    updateItemBtn();
    return true;
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
  // and the 5th wave is a boss. After every level comes a bonus vehicle level (a chase after the mid-boss, an escape
  // after the timeline boss), then the shop. (`this.stage` is the wave number, 1-50 and on into endless.)
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
    return 1 + Math.floor((this.era + 1) / 2); // 1, 2, 2, 3, 3, then +1 every 20 stages in endless
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
    this.enemyShots.clear(true, true);
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
    this.addCoins(2 + this.era);
    this.time.delayedCall(800, () => { if (this.hp > 0) this.startStage(this.stage + 1); });
  }

  // A level is done (its boss is down): every coin left flies to Vega, then the bonus vehicle level.
  levelCleared() {
    this.waveActive = false;
    if (this.P.regen && this.hp > 0) this.hp = Math.min(this.hp + this.P.regen, this.P.maxHp); // Hearth Fire
    if (this.P.stageShield) this.shield = this.P.shieldMax; // Shield Maiden
    this.vacuum = true;
    this.time.delayedCall(1300, () => {
      if (this.hp <= 0) return;
      for (const p of this.pickups.getChildren().slice()) this.collect(p);
      this.vacuum = false;
      this.enemyShots.clear(true, true);
      this.startBonus(this.stage % STAGES_PER_ERA === 0 ? 'escape' : 'chase');
    });
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
    this.enemyShots.clear(true, true);
    this.obstacles.clear(true, true);
    const pay = b.caught * (2 + this.era);
    this.addCoins(pay);
    jingle([523, 659, 784, 1046, 1318]);
    this.banner(`BONUS COMPLETE\n\n${b.caught} RIDERS\n+$${Math.floor(pay * this.P.coinMult)}`, 2400, 22);
    this.time.delayedCall(2600, () => (this.stage === FINAL_STAGE && !this.endless ? openChoice(this) : openShop(this)));
  }

  spawnStage(s) {
    const st = STAGES[s];
    const nForm = st.formation ? st.formation[0] * st.formation[1] : 0;
    const nStream = st.stream ? st.stream[0] * st.stream[1] : 0;
    this.spawnsLeft = nStream;
    if (st.formation) this.formation(...st.formation);
    if (st.stream) this.stream(...st.stream, nForm ? 2500 : 0);
    this.divers = !!st.divers;
    this.nextDive = this.t + 2500;
    this.waveActive = true;
  }

  spawnEnemy(x, y, props) {
    const era = this.E;
    return Object.assign(this.enemies.create(x, y, era.enemy), { hp: this.enemyHp() }, props);
  }

  // A grid that flies in, then sways side to side.
  formation(rows, cols) {
    const sx = 70, sy = 62, left = W / 2 - (cols - 1) * sx / 2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const e = this.spawnEnemy(W / 2, -60, {
          mode: 'formation', homeX: left + c * sx, homeY: 130 + r * sy, fromX: Phaser.Math.Between(0, W), fromY: -60 - r * 40, enter: 0,
        });
        this.tweens.add({ targets: e, enter: 1, delay: (r * cols + c) * 45, duration: 1100, ease: 'Sine.easeOut' });
      }
    }
  }

  // Lines of enemies snaking down the screen; any that get past just leave.
  stream(lines, per, delay = 0) {
    this.streamTimers = [];
    for (let s = 0; s < lines; s++) {
      for (let i = 0; i < per; i++) {
        this.streamTimers.push(this.time.delayedCall(delay + s * 2600 + i * 260, () => {
          this.spawnEnemy(W / 2, -40, { mode: 'stream', age: 0, side: s % 2 ? -1 : 1, phase: s * 0.9 });
          this.spawnsLeft--;
        }));
      }
    }
  }

  // One rider in a bonus level: from ahead in a chase (they look back to shoot at you) or from behind in an escape.
  // They weave about and now and then try to ram you.
  spawnRider(mode) {
    const chase = mode === 'chase', y = Phaser.Math.Between(BAND_TOP + 20, H - 50), x0 = chase ? W + 70 : -70;
    const e = this.spawnEnemy(x0, y, {
      mode: 'ride', fromX: x0, homeX: chase ? Phaser.Math.Between(330, W - 60) : Phaser.Math.Between(60, 270), baseY: y, phase: Math.random() * 6, enter: 0,
    });
    e.hp += 1; // riders are tougher than foot soldiers
    e.play(`rideE-${this.E.id}-${chase ? 'b' : 'f'}`);
    e.body.setSize(e.width * 0.6, e.height * 0.55, true);
    this.tweens.add({ targets: e, enter: 1, duration: 1400, ease: 'Sine.easeOut' });
  }

  spawnBoss(main) {
    const cfg = main ? this.E.boss : this.E.mid;
    this.banner(cfg.name, 2200, 26);
    const b = this.boss = this.physics.add.image(W / 2, -110, cfg.key).setDepth(1);
    Object.assign(b, { cfg, main, ready: false });
    b.maxHp = b.hp = this.bossHp(main);
    this.tweens.add({ targets: b, y: 180, duration: 2200, ease: 'Sine.easeOut', onComplete: () => { b.ready = true; b.readyAt = this.et; } });
    this.bossColliders = [
      this.physics.add.overlap(b, this.bullets, (boss, bullet) => this.bulletHit(bullet, boss)),
      this.physics.add.overlap(this.player, b, () => this.hitPlayer()),
    ];
    this.bossBar = this.add.graphics().setDepth(10);
    this.nextFan = this.t + 3000;
    this.nextAim = this.t + 4200;
  }

  // ----- Vega's shooting -----
  // Damage right now: Aquila Standard adds a bonus while at full HP.
  // Bushido adds a bonus on your last HP.
  dmgNow() {
    const P = this.P;
    return P.dmg * (this.hp >= P.maxHp ? 1 + P.fullHpDmg : 1) * (this.hp === 1 ? 1 + P.lowHpDmg : 1);
  }

  // Berserker Rage: shoot faster the more HP you're missing (never more than about 3x).
  fireDelay() {
    return this.P.fireDelay * Math.max(0.35, 1 - this.P.berserk * (this.P.maxHp - this.hp));
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
        this.spawnBullet(x, y, 'laser', aim + (i - (P.shots - 1) / 2) * 0.12, { dmg: this.dmgNow(), pierce: P.pierce, bounce: P.bounce });
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
          this.spawnBullet(px, py, P.partnerPierce ? 'arrowUp' : 'laser', aim, { dmg: 0.6 * P.dmg, pierce: P.partnerPierce, bounce: 0 });
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
  }

  // Angle in radians: -PI/2 is straight up.
  spawnBullet(x, y, tex, angle, o) {
    const speed = o.speed ?? this.P.bulletSpeed;
    const b = this.bullets.create(x, y, tex).setRotation(angle + Math.PI / 2).setScale(o.scale ?? 1);
    b.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    return Object.assign(b, { dmg: o.dmg, pierce: o.pierce, bounce: o.bounce, explode: o.explode ?? 0, cannon: !!o.cannon, hits: new Set() });
  }

  // A shot hits an enemy or the boss. Piercing shots keep going; each shot hits a given target once per bounce.
  bulletHit(b, target) {
    if (!b.active || !target.active || b.hits.has(target)) return;
    const isBoss = target === this.boss;
    if (isBoss && !target.ready) return void b.destroy(); // can't be hurt while arriving
    b.hits.add(target);
    if (this.P.burn) this.ignite(target);
    this.damage(target, b.dmg, isBoss, b.cannon);
    if (b.explode) this.explode(b.x, b.y, b.explode, b.dmg, b.cannon);
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
    if (this.boss?.ready && Phaser.Math.Distance.Between(x, y, this.boss.x, this.boss.y) < r + 50) this.damage(this.boss, dmg, true, cannon);
  }

  // ----- Enemies -----
  // Angle is measured from straight down: 0 = down, positive = towards the right.
  shoot(x, y, tex, speed, angle) {
    const s = this.enemyShots.create(x, y, tex);
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
      this.addScore(100 * (this.era + 1));
      this.addCharge(1);
      if (this.P.dynamite) { // Dynamite: it blows up a moment later, maybe taking its neighbours with it
        const { x, y } = e;
        this.time.delayedCall(90, () => this.explode(x, y, 60 * this.P.dynamite, 2 * this.dmgNow(), false, this.P.dynamiteBurns));
      }
      const roll = Math.random();
      if (roll < 0.55) this.drop('coin', e.x, e.y);
      else if (roll < 0.58) this.drop('donut', e.x, e.y); // rare: heals 1 HP
    }
    e.destroy();
  }

  bossDown() {
    const b = this.boss;
    this.boss = null;
    this.bossColliders.forEach(c => c.destroy());
    this.bossBar.destroy();
    b.disableBody(false, false);
    this.enemyShots.clear(true, true);
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
      // Then the escape bonus level: flee with the part (after the 5th part, the go-home-or-endless choice follows it).
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
      const lost = Math.min(Math.floor(this.coins), 3 + this.era);
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
      this.tweens.add({ targets: [this.player, ...this.partners], y: -120, delay: 600, duration: 2200 });
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
      if (kx || ky) this.setTarget(this.target.x + kx * P.moveSpeed * dt, this.target.y + ky * P.moveSpeed * dt);
      const dx = this.target.x - this.player.x, dy = this.target.y - this.player.y, dist = Math.hypot(dx, dy), step = P.moveSpeed * dt;
      if (dist > step) this.player.setPosition(this.player.x + dx / dist * step, this.player.y + dy / dist * step);
      else this.player.setPosition(this.target.x, this.target.y);
      this.fire();
    }

    // Partners walk beside Vega, one on each side.
    this.partners.forEach((pt, i) => {
      const ease = Math.min(1, dt * 8);
      pt.x += (this.player.x + (i % 2 ? 62 : -62) - pt.x) * ease;
      pt.y += (this.player.y + 14 - pt.y) * ease;
    });

    // Scutum: recharge one shield charge at a time.
    if (this.shield < P.shieldMax) {
      if (this.t >= this.shieldNextAt) { this.shield++; this.shieldNextAt = this.t + P.shieldRecharge; this.updateHud(); }
    } else this.shieldNextAt = this.t + P.shieldRecharge;
    this.shieldRing.clear();
    if (this.player.active && this.t < this.testudoUntil) this.shieldRing.lineStyle(5, 0xffd23b, 0.8).strokeCircle(this.player.x, this.player.y + 8, 50);
    if (this.shield > 0 && this.player.active) this.shieldRing.lineStyle(3, 0x4ff0ff, 0.6).strokeCircle(this.player.x, this.player.y + 8, 44);

    // Enemy tints: blue while the Siren has them frozen (they stand still and don't shoot), orange while burning.
    // Burning (Fire) does steady damage for its 3 s.
    for (const e of [...this.enemies.getChildren(), this.boss].filter(Boolean)) {
      const burning = e.burnUntil > this.t, tint = frozen ? 0x88ccff : burning ? 0xff9944 : 0;
      if (tint) e.setTint(tint);
      else if (e.isTinted && (e.tintTopLeft === 0x88ccff || e.tintTopLeft === 0xff9944)) e.clearTint();
      if (burning && P.burn) this.damage(e, 2 * P.burn * P.dmg * dt, e === this.boss, false, true);
    }
    if (!frozen) {
      this.updateEnemies(dt);
      this.updateBoss();
    } else if (this.boss) this.drawBossBar();

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
      if (b.spin) b.angle += b.spin * dt;
      if (b.returnAt && this.t > b.returnAt && this.player.active) { // boomerangs (and Returning Axes) fly back to Vega
        if (!b.returning) { b.returning = true; b.hits.clear(); }
        this.physics.moveToObject(b, this.player, 620);
        if (Phaser.Math.Distance.Between(b.x, b.y, this.player.x, this.player.y) < 30) b.destroy();
      }
    }

    // Shuriken Ring: stars circle Vega, cutting what they touch (each enemy at most every 0.4 s) and blocking shots.
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
      if (this.boss?.ready && near(this.boss, 70) && !(this.boss.starCd > this.t)) { this.boss.starCd = this.t + 400; this.damage(this.boss, 1.5 * this.dmgNow(), true); }
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
      } else if (e.mode === 'dive') {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        if (e.y > H + 40) { // walked past: come back in from the top to its old spot
          Object.assign(e, { mode: 'formation', fromX: e.homeX, fromY: -60, enter: 0 });
          this.tweens.add({ targets: e, enter: 1, duration: 1200, ease: 'Sine.easeOut' });
        }
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
    }

    const pressure = (1 + 0.2 * this.era + 0.04 * ((this.stage - 1) % STAGES_PER_ERA)) * this.diff.fire;
    const side = this.view === 'side';
    if (this.divers && this.t > this.nextDive) {
      this.nextDive = this.t + 1500 / this.diff.fire;
      const e = Phaser.Utils.Array.GetRandom(this.enemies.getChildren().filter(x => x.mode === 'formation' && x.enter === 1));
      if (e && this.player.active) {
        Object.assign(e, { mode: 'dive', vx: (this.player.x - e.x) * 0.45, vy: 300 });
        beep(280, 90, 0.03);
      }
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
      const shooters = this.enemies.getChildren().filter(x => (side ? x.x > 0 && x.x < W : x.y > 0 && x.y < H * 0.7));
      this.nextEnemyShot = this.t + (shooters.length ? 1000 : 300) / pressure;
      const e = Phaser.Utils.Array.GetRandom(shooters);
      // On foot they lob shots roughly your way; riders aim straight at you.
      if (e && side) this.shoot(e.x + Math.sign(this.player.x - e.x) * 24, e.y - 6, this.E.shot, this.diff.shotSpeed, this.angleToPlayer(e.x, e.y));
      else if (e) this.shoot(e.x, e.y + 20, this.E.shot, this.diff.shotSpeed, Phaser.Math.Clamp(this.angleToPlayer(e.x, e.y) * 0.5, -0.5, 0.5));
    }
  }

  drawBossBar() {
    const b = this.boss, bw = W - 120;
    this.bossBar.clear().fillStyle(0x000000, 0.6).fillRect(60, 64, bw, 12).fillStyle(0xff4fd8).fillRect(60, 64, bw * Math.max(0, b.hp) / b.maxHp, 12);
  }

  updateBoss() {
    const b = this.boss;
    if (!b) return;
    this.drawBossBar();
    if (!b.ready) return;

    b.x = W / 2 + Math.sin((this.et - b.readyAt) / 1300) * (W / 2 - 90);
    const rage = b.hp < b.maxHp / 2 ? 0.65 : 1; // attacks come faster below half health
    const speed = this.diff.shotSpeed / 250, shot = b.cfg.shot;
    if (this.t > this.nextFan) {
      this.nextFan = this.t + 1800 * rage / this.diff.fire;
      const n = b.main && rage < 1 ? 7 : 5;
      for (let i = 0; i < n; i++) this.shoot(b.x, b.y + 40, shot, 220 * speed, -0.7 + 1.4 * i / (n - 1));
      beep(180, 120, 0.04);
    }
    if (this.t > this.nextAim) {
      this.nextAim = this.t + 2600 * rage / this.diff.fire;
      for (let i = 0; i < 3; i++) {
        this.time.delayedCall(i * 150, () => {
          if (this.boss && this.player.active) this.shoot(b.x, b.y + 40, shot, 320 * speed, this.angleToPlayer(b.x, b.y));
        });
      }
    }
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
