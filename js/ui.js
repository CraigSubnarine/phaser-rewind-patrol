// Rewind Patrol menus, shop, settings, sound and input. The menus are plain HTML on top of the game canvas.

// Settings and best scores are saved in this browser. Private windows can block storage, so every access is guarded.
const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
};
const settings = { sound: true, difficulty: 'normal', ...store.get('rewind-settings', {}) };
if (!DIFFICULTY[settings.difficulty]) settings.difficulty = 'normal';
const saveSettings = () => store.set('rewind-settings', settings);
const bestKey = () => `rewind-best-${settings.difficulty}`;

// ---------- Sound: tiny synth beeps and noise bursts, no audio files. ----------
// Browsers (iPhones especially) only allow sound after a tap or key press, so the audio is created on the first one.
let audio;
function unlockAudio() { try { audio ??= new AudioContext(); audio.resume(); } catch {} }
addEventListener('pointerup', unlockAudio);
addEventListener('keydown', unlockAudio);
function beep(freq, ms = 60, vol = 0.05) {
  if (!audio || !settings.sound) return;
  try {
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = 'square';
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + ms / 1000);
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + ms / 1000);
  } catch {}
}
function boom(ms = 120, vol = 0.08) {
  if (!audio || !settings.sound) return;
  try {
    const len = Math.floor(audio.sampleRate * ms / 1000), buf = audio.createBuffer(1, len, audio.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = audio.createBufferSource(), g = audio.createGain();
    g.gain.value = vol;
    src.buffer = buf;
    src.connect(g).connect(audio.destination);
    src.start();
  } catch {}
}
const jingle = notes => notes.forEach((f, i) => setTimeout(() => beep(f, 90), i * 90));

// ---------- Menus ----------
const $ = id => document.getElementById(id);
// The whole game is in one of these states; only 'playing' accepts game input.
// 'menu' | 'story' | 'playing' | 'paused' | 'shop' | 'over' | 'won'
const app = { state: 'menu', settingsFrom: 'main', seed: '', shop: null };
let game;
const scene = () => game?.scene.getScene('play');

// A run seed decides the shop rolls, so the same seed plays out the same way. Letters that can't be misread.
const randomSeed = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');

// Show one menu screen (or none, while playing) and put keyboard focus on its main button.
function showScreen(id) {
  $('ui').hidden = !id;
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  if (id) $(id).querySelector('.primary, button')?.focus({ preventScroll: true });
  updateItemBtn();
}
// The active-item button: shown while playing with an item, its bar fills as the item charges.
function updateItemBtn() {
  const s = scene(), item = s?.playing ? s.P?.active : null, btn = $('itemBtn');
  btn.hidden = !(app.state === 'playing' && item);
  if (btn.hidden) return;
  const pct = Math.min(1, s.charge / s.chargeNeeded());
  $('itemName').textContent = item.name;
  btn.style.setProperty('--charge', pct);
  btn.classList.toggle('ready', pct >= 1);
  btn.setAttribute('aria-label', `${item.name}: ${pct >= 1 ? 'ready' : `${Math.floor(pct * 100)}% charged`}`);
}
function updateMainBest() {
  $('mainBest').textContent = `Best (${DIFFICULTY[settings.difficulty].label}): ${store.get(bestKey(), 0)}`;
}
function buildText(s) {
  const items = Object.entries(s.owned).map(([id, n]) => UPGRADE[id].name + (n > 1 ? ` Lv${n}` : '') + (UPGRADE[id].active ? ' (active)' : ''));
  return `Build: ${items.length ? items.join(', ') : 'nothing yet'}.` + combosText(s);
}
const combosText = s => (s.combos.length ? ` Combos: ${s.combos.map(c => c.name).join(', ')}.` : '');
// The loadout grid (shop and pause): the gun's five slots, then body gear, then the companions and the active item,
// each with the item in it and its level pips. Built only from the game's own data, so innerHTML is safe.
const LOADOUT_ROWS = [['barrel', 'ammo', 'sight', 'trigger', 'under'], ['armour', 'boots', 'charm'], ['companion', 'active']];
function loadoutHtml(s) {
  return LOADOUT_ROWS.map(keys => {
    const tiles = keys.flatMap(k => s.loadout[k].map((id, i) => {
      const u = id && UPGRADE[id], lvl = u ? s.owned[id] : 0, label = k === 'companion' ? (i ? 'Right' : 'Left') : SLOTS[k].name;
      const pips = u && !u.active ? `<i aria-label="level ${lvl} of ${u.max}">${'&#9679;'.repeat(lvl)}${'&#9675;'.repeat(u.max - lvl)}</i>` : '';
      return `<div class="slot${u ? '' : ' empty'}"><span>${label}</span><b>${u ? u.name : '-'}</b>${pips}</div>`;
    }));
    return `<div class="loadout-row" style="--n:${tiles.length}">${tiles.join('')}</div>`;
  }).join('');
}
// Restarting the scene wipes every enemy, timer and tween from the last run in one go.
// sys.resume first: a paused scene must be running again before it restarts.
function restartScene(play) {
  scene().sys.resume();
  scene().scene.restart({ play });
}
function toMenu() {
  app.state = 'menu';
  restartScene(false);
  $('pauseBtn').hidden = true;
  updateMainBest();
  showScreen('main');
}
function showStory() {
  app.state = 'story';
  $('seedInput').value = randomSeed();
  showScreen('story');
}
function startGame(seed) {
  app.seed = (seed || randomSeed()).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || randomSeed();
  app.state = 'playing';
  restartScene(true);
  showScreen(null);
  $('pauseBtn').hidden = false;
  document.activeElement?.blur();
}
// sys.pause/resume act immediately; scene.pause/resume wait a frame, which races with menu clicks.
function pauseGame() {
  if (app.state !== 'playing') return;
  app.state = 'paused';
  scene().sys.pause();
  $('pauseBtn').hidden = true;
  const s = scene();
  $('pauseLoadout').innerHTML = loadoutHtml(s);
  $('pauseBuild').textContent = `${combosText(s)} Route: ${s.route.slice(0, TIMELINES).map(e => e.name).join(' > ')}. Seed ${app.seed}.`.trim();
  showScreen('pause');
}
function resumeGame() {
  scene().sys.resume();
  app.state = 'playing';
  showScreen(null);
  $('pauseBtn').hidden = false;
  document.activeElement?.blur();
}
function openSettings() {
  // Difficulty is locked mid-game; changing it means starting over, so that's done from the main menu.
  app.settingsFrom = app.state === 'paused' ? 'pause' : 'main';
  const locked = app.settingsFrom === 'pause';
  $('difficulty').disabled = locked;
  $('difficultyHint').hidden = !locked;
  showScreen('settings');
}
function endGame(won, s) {
  app.state = won ? 'won' : 'over';
  $('pauseBtn').hidden = true;
  const era = s.E;
  $('endTitle').textContent = won ? 'CASE CLOSED' : 'GAME OVER';
  $('endText').textContent = (won ? 'Officer Vega is back in 1986, time drive fixed.'
    : s.endless ? `Lost in time: ${era.name}, ${era.year}, endless wave ${s.stage}.` : `Stranded in ${era.name}, ${era.year}, on wave ${s.stage}.`)
    + ` Score ${s.score}.` + (s.newBest ? ' New best!' : '');
  $('endBuild').textContent = `${buildText(s)} Seed ${app.seed}.`;
  showScreen('end');
}

// ---------- After stage 50's part: go home (the ending) or keep going in endless ----------
function openChoice(s) {
  app.state = 'choice';
  s.sys.pause();
  $('pauseBtn').hidden = true;
  showScreen('choice');
}
function choose(endless) {
  const s = scene();
  s.sys.resume();
  app.state = 'playing';
  showScreen(null);
  $('pauseBtn').hidden = false;
  document.activeElement?.blur();
  if (!endless) return s.victory();
  s.endless = true;
  s.updateHud();
  s.banner('ENDLESS\nPATROL', 1600, 26);
  openShop(s); // then wave 51 in a new timeline
}

// ---------- Shop: between every stage ----------
function openShop(s) {
  app.state = 'shop';
  s.sys.pause();
  $('pauseBtn').hidden = true;
  app.shop = { offers: s.rollOffers(), sold: new Set(), rerolls: 0, healPrice: 8, choosing: null };
  $('shopNote').textContent = 'Each slot holds one item (Charm and companions: two). Buy again to level up; a new item replaces the old one and sells it back for half.';
  renderShop();
  showScreen('shop');
}
function comboHint(u, owned) {
  return COMBOS.filter(c => c.needs.includes(u.id) && !c.needs.every(id => owned[id])).map(c => {
    const other = c.needs.find(id => id !== u.id);
    return `<span class="combo">${owned[other] ? `Completes combo: ${c.name}!` : `Combo with ${UPGRADE[other].name}: ${c.name}`}</span>`;
  }).join('');
}
// Card text comes only from the game's own data (no player input), so innerHTML is safe here.
// Each card names its slot and says what buying it does: a level up, filling an empty place, or replacing something
// (which sells back for half). In a full two-place slot (Charm, companions) tapping the card asks which one goes.
function renderShop() {
  const s = scene(), shop = app.shop, coins = Math.floor(s.coins);
  $('shopTitle').textContent = `${s.E.name.toUpperCase()} MARKET`;
  $('shopCoins').textContent = `$${coins}  HP ${s.hp}/${s.P.maxHp}`;
  $('shopLoadout').innerHTML = loadoutHtml(s);
  $('shopItems').replaceChildren(...shop.offers.map((u, i) => {
    const cost = priceOf(u, s.owned), have = s.owned[u.id] || 0, sold = shop.sold.has(i), row = s.loadout[u.slot];
    const choose = !have && row.length > 1 && !row.includes(null), [, old] = s.placeFor(u);
    const refund = choose ? Math.max(...row.map(id => s.refundFor(id))) : s.refundFor(old);
    const side = j => (u.slot === 'companion' ? `${j ? 'Right' : 'Left'}: ` : '');
    if (shop.choosing === i) { // which one goes?
      const box = document.createElement('div');
      box.className = 'chooser';
      box.innerHTML = `<b>${u.name}: replace which?</b>${row.map((id, j) => `<button data-replace="${id}"${cost > coins + s.refundFor(id) ? ' disabled' : ''}>`
        + `${side(j)}${UPGRADE[id].name} (+$${s.refundFor(id)} back)</button>`).join('')}<button data-cancel>Keep both</button>`;
      return box;
    }
    const b = document.createElement('button');
    b.className = `card${sold ? ' sold' : ''}`;
    b.dataset.buy = i;
    b.disabled = sold || have >= u.max || cost > coins + refund;
    const what = have >= u.max ? 'Max level' : have ? `Level ${have + 1} of ${u.max}`
      : choose ? `Replaces your ${row.map((id, j) => side(j) + UPGRADE[id].name).join(' or ')} (you pick; it sells back for half)`
        : old ? `Replaces your ${UPGRADE[old].name} (+$${refund} back)` : '';
    b.innerHTML = `<span class="tag">${SLOTS[u.slot].name.toUpperCase()} &middot; ${u.era ? `${ERA[u.era].name.toUpperCase()} ONLY` : 'ANY TIMELINE'}</span>`
      + `<b>${u.name}</b><span class="price">${sold ? 'SOLD' : `$${cost}`}</span><small>${u.desc}</small>`
      + `${what ? `<span class="combo">${what}</span>` : ''}${comboHint(u, s.owned)}`;
    return b;
  }));
  const rerollCost = 3 + 2 * shop.rerolls;
  $('rerollBtn').textContent = `Reroll $${rerollCost}`;
  $('rerollBtn').disabled = rerollCost > coins;
  $('healBtn').textContent = `Coffee +1 HP $${shop.healPrice}`;
  $('healBtn').disabled = shop.healPrice > coins || s.hp >= s.P.maxHp;
  $('shopBuild').textContent = combosText(s).trim() || 'No combos yet: pair gear from two different slots.';
}
// `replace`: which item goes, chosen in a full two-place slot.
function shopBuy(i, replace) {
  const s = scene(), u = app.shop.offers[i], row = s.loadout[u.slot];
  if (!replace && !s.owned[u.id] && row.length > 1 && !row.includes(null)) { // ask which one goes first
    app.shop.choosing = i;
    return renderShop();
  }
  app.shop.choosing = null;
  const [, old] = s.placeFor(u, replace), refund = s.refundFor(old), had = s.combos;
  const unlocked = s.buy(u, replace);
  if (!unlocked) return renderShop();
  app.shop.sold.add(i);
  const lost = had.filter(c => !s.combos.includes(c));
  const notes = [old && `Sold your ${UPGRADE[old].name} for $${refund}.`, lost.length && `Lost combo: ${lost.map(c => c.name).join(', ')}.`,
    unlocked.length && `COMBO UNLOCKED: ${unlocked.map(c => `${c.name} (${c.desc})`).join(' ')}`].filter(Boolean);
  if (notes.length) $('shopNote').textContent = notes.join(' ');
  if (unlocked.length) jingle([523, 659, 784, 1046, 1318]);
  else beep(880, 60);
  renderShop();
}
function shopReroll() {
  const s = scene(), cost = 3 + 2 * app.shop.rerolls;
  if (s.coins < cost) return;
  s.coins -= cost;
  app.shop.rerolls++;
  app.shop.offers = s.rollOffers();
  app.shop.sold = new Set();
  app.shop.choosing = null;
  beep(440, 50);
  renderShop();
}
function shopHeal() {
  const s = scene();
  if (s.coins < app.shop.healPrice || s.hp >= s.P.maxHp) return;
  s.coins -= app.shop.healPrice;
  s.hp++;
  app.shop.healPrice += 4;
  jingle([523, 784]);
  renderShop();
}
function closeShop() {
  const s = scene();
  s.sys.resume();
  app.state = 'playing';
  showScreen(null);
  $('pauseBtn').hidden = false;
  document.activeElement?.blur();
  s.updateHud();
  s.afterShop();
}

$('ui').addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn || !scene()) return;
  if (btn.dataset.buy !== undefined) return shopBuy(Number(btn.dataset.buy));
  if (btn.dataset.replace !== undefined) return shopBuy(app.shop.choosing, btn.dataset.replace);
  if (btn.dataset.cancel !== undefined) { app.shop.choosing = null; return renderShop(); }
  const action = btn.dataset.action;
  if (action === 'play') showStory();
  else if (action === 'start') startGame($('seedInput').value);
  else if (action === 'again') startGame();
  else if (action === 'resume') resumeGame();
  else if (action === 'menu') toMenu();
  else if (action === 'settings') openSettings();
  else if (action === 'back') showScreen(app.settingsFrom);
  else if (action === 'reroll') shopReroll();
  else if (action === 'heal') shopHeal();
  else if (action === 'continue') closeShop();
  else if (action === 'home') choose(false);
  else if (action === 'endless') choose(true);
});
$('pauseBtn').addEventListener('click', pauseGame);
$('itemBtn').addEventListener('click', () => scene()?.useActive());
for (const r of document.querySelectorAll('input[name=difficulty]')) {
  r.checked = r.value === settings.difficulty;
  r.addEventListener('change', () => { settings.difficulty = r.value; saveSettings(); updateMainBest(); });
}
$('sound').checked = settings.sound;
$('sound').addEventListener('change', e => { settings.sound = e.target.checked; saveSettings(); });
addEventListener('keydown', e => {
  const key = e.key?.toLowerCase();
  if ((key === ' ' || key === 'e') && app.state === 'playing') { // Space or E fires the active item
    e.preventDefault();
    scene()?.useActive();
  }
  if (key !== 'escape' && key !== 'p') return;
  if (app.state === 'playing') pauseGame();
  else if (app.state === 'paused') resumeGame();
});
// Switching apps or tabs mid-game opens the pause menu.
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });

// Steering listens on the whole page, so a thumb anywhere (even below the game) can move Vega.
let drag = null;
addEventListener('pointerdown', e => {
  if (e.target.closest?.('button, a, label, input')) return; // taps on menu controls aren't game input
  drag = { x: e.clientX, y: e.clientY };
});
addEventListener('pointermove', e => scene()?.steer(e));
addEventListener('pointerup', () => { drag = null; });
addEventListener('pointercancel', () => { drag = null; });

updateMainBest();
