// Rewind Patrol menus, shop, settings, sound and input. The menus are plain HTML on top of the game canvas.

// Settings and best scores are saved in this browser. Private windows can block storage, so every access is guarded.
const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
};
const settings = { sound: true, difficulty: 'normal', graphics: '2d', ...store.get('rewind-settings', {}) };
if (!DIFFICULTY[settings.difficulty]) settings.difficulty = 'normal';
const saveSettings = () => store.set('rewind-settings', settings);
// A daily patrol always runs on Normal; any other run on the difficulty from Settings.
const runDifficulty = () => (app.daily ? 'normal' : settings.difficulty);
const bestKey = () => `rewind-best-${runDifficulty()}`;

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
const app = { state: 'menu', settingsFrom: 'main', seed: '', shop: null, daily: null }; // daily: today's board, during a daily patrol
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
  $('mainBest').textContent = `Best (${DIFFICULTY[settings.difficulty].label}): ${store.get(`rewind-best-${settings.difficulty}`, 0)}`;
}
function buildText(s) {
  const items = Object.entries(s.owned).map(([id, n]) => UPGRADE[id].name + (n > 1 ? ` ${TIERS[n]}` : '') + (UPGRADE[id].active ? ' (active)' : ''));
  return `Build: ${items.length ? items.join(', ') : 'nothing yet'}.` + combosText(s);
}
const combosText = s => (s.combos.length ? ` Combos: ${s.combos.map(c => c.name).join(', ')}.` : '');
const TIERS = ['', 'I', 'II', 'III'];

// ---------- The backpack: shaped pieces in a grid (see BACKPACK in data.js) ----------
// Which sprite shows each item: its own backpack icon (icon-<id> in art.js), or a game sprite that already shows it.
const ITEM_ICONS = {
  magnum: 'bullet', pilum: 'spear', longbow: 'arrowUp', cannon: 'cannonball', dynamite: 'dynamite', shuriken: 'shuriken', axes: 'axe',
  boomerang: 'boomerang', drone: 'drone', molotov: 'molotov', scavenger: 'coin', drill: 'drillbolt', torpedo: 'torpedo', partner: 'partner',
};
const iconUrls = {};
const iconUrl = id => (iconUrls[id] ??= game.textures.getBase64(ITEM_ICONS[id] ?? `icon-${id}`));
const PIECE_COLORS = { one: '#5b3a9a', tall: '#2b6c8a', wide: '#8a5a2b', long: '#2e6b3a', big: '#7a2e4a', ell: '#3f4a9a' };
const SHAPE_NAMES = { one: '1x1', tall: '1x2', wide: '2x1', long: '1x3', big: '2x2', ell: 'L' };
// The grid: each cell colored by the piece in it (with an outline round each piece), and each piece's icon and tier on
// top. In the shop (`sellable`), the pieces are buttons: tap one to sell it. Built only from the game's own data, so
// innerHTML is safe.
function backpackHtml(s, sellable, picked) {
  const owner = {};
  for (const [id, cells] of Object.entries(s.pack)) for (const [x, y] of cells) owner[`${x},${y}`] = id;
  let html = '';
  for (let y = 0; y < s.packRows; y++) for (let x = 0; x < BACKPACK.w; x++) {
    const id = owner[`${x},${y}`], edges = [['top', 0, -1], ['right', 1, 0], ['bottom', 0, 1], ['left', -1, 0]].filter(([, dx, dy]) => owner[`${x + dx},${y + dy}`] !== id);
    const look = id ? `background:${PIECE_COLORS[UPGRADE[id].shape]};${edges.map(([side]) => `border-${side}-color:var(--text)`).join(';')}` : '';
    html += `<div class="cell" style="grid-area:${y + 1}/${x + 1};${look}"></div>`;
  }
  for (const [id, cells] of Object.entries(s.pack)) {
    const xs = cells.map(c => c[0]), ys = cells.map(c => c[1]), [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const rect = cells.length === (x1 - x0 + 1) * (y1 - y0 + 1), shape = SHAPES[UPGRADE[id].shape];
    // An L's icon sits on its corner cell; anything else's covers the whole piece (turned with it, for long ones).
    const [cx, cy] = rect ? [x0, y0] : cells.find(([x, y]) => cells.some(c => c[0] === x && c[1] !== y) && cells.some(c => c[1] === y && c[0] !== x));
    const area = rect ? `${y0 + 1}/${x0 + 1}/${y1 + 2}/${x1 + 2}` : `${cy + 1}/${cx + 1}`, turned = rect && x1 - x0 + 1 !== shape[0].length;
    const tag = sellable ? 'button' : 'div', label = `${UPGRADE[id].name}, tier ${TIERS[s.owned[id]]}`;
    html += `<${tag} class="piece${picked === id ? ' picked' : ''}" style="grid-area:${area}" ${sellable ? `data-piece="${id}" aria-label="${label}: tap to sell"` : `title="${label}"`}>`
      + `<img src="${iconUrl(id)}" alt=""${turned ? ' class="turned"' : ''}><i>${TIERS[s.owned[id]]}</i></${tag}>`;
  }
  return `<div class="backpack" style="--rows:${s.packRows}">${html}</div>`;
}
// A small drawing of a piece's shape, for shop cards.
const shapeHtml = u => `<span class="shape" style="--w:${SHAPES[u.shape][0].length}">${SHAPES[u.shape].join('').split('').map(c => `<span${c === '#' ? ' class="on"' : ''}></span>`).join('')}</span>`;

// Restarting the scene wipes every enemy, timer and tween from the last run in one go.
// sys.resume first: a paused scene must be running again before it restarts.
function restartScene(play) {
  scene().sys.resume();
  scene().scene.restart({ play });
}
function toMenu() {
  app.state = 'menu';
  app.daily = null;
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
function startGame(seed, daily = null) {
  app.daily = daily;
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
  $('pauseLoadout').innerHTML = backpackHtml(s, false);
  $('pauseBuild').textContent = `${s.P.active ? `Active item: ${s.P.active.name}.` : ''}${combosText(s)} Route: ${s.route.slice(0, TIMELINES).map(e => e.name).join(' > ')}. Seed ${app.seed}.`.trim();
  showScreen('pause');
}
function resumeGame() {
  scene().sys.resume();
  app.state = 'playing';
  showScreen(null);
  $('pauseBtn').hidden = false;
  document.activeElement?.blur();
}
// Today's patrol, the same for everyone (by the UTC date): seed DAY261116 and the board daily-2026-11-16.
const today = () => new Date().toISOString().slice(0, 10);
function startDaily() { startGame(`DAY${today().slice(2).replace(/-/g, '')}`, `daily-${today()}`); }
// Settings, the leaderboard and the name screen go back to wherever they were opened from.
function setBack() { app.settingsFrom = { paused: 'pause', over: 'end', won: 'end' }[app.state] ?? 'main'; }
function openSettings() {
  // Difficulty is locked mid-game; changing it means starting over, so that's done from the main menu.
  setBack();
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
  $('endRank').textContent = '';
  showScreen('end');
  postRun(s.score);
}

// ---------- Account and leaderboards (js/arcade.js: Google sign-in through the Arcade's shared Supabase) ----------
// Signing in is optional. Boards: one per difficulty ('easy', 'normal', 'hard') and one per day ('daily-2026-11-16'),
// each player's best. The cloud save keeps your best per difficulty.
const account = createArcade('phaser-rewind-patrol', updateAccount);
let syncedFor = null; // the player whose cloud save has been merged in this visit
updateAccount(); // signed out until Supabase says otherwise (a moment after load, if you have a session)
function updateAccount() {
  const inn = !!account.user;
  for (const el of document.querySelectorAll('.signin')) el.hidden = inn || !account.online;
  for (const el of document.querySelectorAll('.acct')) el.hidden = !inn;
  for (const el of document.querySelectorAll('.acctName')) el.textContent = account.name ?? ''; // player input: text only
  if (inn && syncedFor !== account.user.id) { syncedFor = account.user.id; syncSave(); }
}
const DIFFS = Object.keys(DIFFICULTY);
// Merges this device's bests with the cloud save (the higher of each), then posts any best this device hasn't posted
// yet (so guest play counts once you sign in).
async function syncSave() {
  const here = Object.fromEntries(DIFFS.map(d => [d, store.get(`rewind-best-${d}`, 0)]));
  const merged = await account.sync({ best: here }, (a, b) => ({ best: mergeMax(a.best, b.best) }));
  const posted = store.get('rewind-posted', {});
  for (const d of DIFFS) {
    const best = merged.best[d] ?? 0;
    store.set(`rewind-best-${d}`, best);
    if (best > (posted[d] ?? 0)) { posted[d] = best; account.post(best, d); }
  }
  store.set('rewind-posted', posted);
  if (app.state === 'menu') updateMainBest();
}
async function signIn() {
  const msg = document.querySelector('.acctMsg');
  msg.hidden = true;
  if (!(await account.signIn())) { msg.textContent = "Can't reach sign-in right now. Check your connection."; msg.hidden = false; }
}
// After a run: post the score to its board if you're signed in, then show where you stand there.
async function postRun(score) {
  if (!account.user) return;
  const mode = app.daily ?? runDifficulty(), label = app.daily ? "Today's patrol" : `${DIFFICULTY[mode].label} leaderboard`;
  if (!app.daily) { const posted = store.get('rewind-posted', {}); posted[mode] = Math.max(posted[mode] ?? 0, score); store.set('rewind-posted', posted); }
  $('endRank').textContent = 'Posting your score...';
  const ok = await account.post(score, mode, app.seed);
  if (!app.daily) syncSave();
  const me = ok ? await account.standing(mode) : null;
  if ($('end').hidden) return;
  $('endRank').textContent = me ? `${label}: #${me.rank} of ${me.of} players` : ok ? '' : "Offline: your score will post next time you're connected.";
}
// The leaderboard: one tab per difficulty, and today's patrol.
let boardLoad = 0;
async function openBoard(tab = app.daily ? 'daily' : runDifficulty()) {
  if ($('board').hidden) setBack();
  const mode = tab === 'daily' ? `daily-${today()}` : tab, load = ++boardLoad;
  for (const b of document.querySelectorAll('#boardTabs button')) b.classList.toggle('on', b.dataset.board === tab);
  $('boardInfo').textContent = tab === 'daily' ? `Today's patrol (seed DAY${today().slice(2).replace(/-/g, '')}, Normal): each player's best.` : "Each player's best score.";
  showScreen('board');
  $('boardList').replaceChildren();
  $('boardYou').textContent = 'Loading...';
  const [rows, me] = await Promise.all([account.top(mode), account.standing(mode)]);
  if (load !== boardLoad || $('board').hidden) return; // another tab was picked meanwhile
  if (!rows) { $('boardYou').textContent = "Couldn't load the leaderboard. Check your connection."; return; }
  $('boardList').replaceChildren(...rows.map((r, i) => {
    const li = document.createElement('li');
    if (r.me) li.className = 'me';
    for (const [cls, text] of [['r', i + 1], ['n', r.name], ['s', r.score.toLocaleString()]]) {
      const span = document.createElement('span');
      span.className = cls;
      span.textContent = text; // names are player input: never innerHTML
      li.append(span);
    }
    return li;
  }));
  $('boardYou').textContent = !rows.length ? 'No scores yet. Be the first!'
    : me && !rows.some(r => r.me) ? `You: #${me.rank} of ${me.of} · ${me.score.toLocaleString()}` : '';
}
function openName() {
  setBack();
  showScreen('nameScreen');
  $('nameInput').value = account.name ?? '';
  $('nameErr').textContent = '';
  $('nameInput').focus({ preventScroll: true });
}
async function saveName() {
  const err = await account.rename($('nameInput').value);
  if (err) $('nameErr').textContent = err;
  else showScreen(app.settingsFrom);
}
$('nameInput').addEventListener('keydown', e => { if (e.key === 'Enter') saveName(); });

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
  app.shop = { offers: s.rollOffers(), sold: new Set(), rerolls: 0, healPrice: 8, picked: null };
  $('shopNote').textContent = 'Fit your gear in the backpack. Buying something you have merges it up a tier; tap a piece to sell it. The backpack grows after each timeline boss.';
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
// Each card shows the piece's shape and says what buying it does: merge into the next tier, fit in the backpack, or
// replace your active item (which sells back for half); or why it can't be bought yet.
function renderShop() {
  const s = scene(), shop = app.shop, coins = Math.floor(s.coins);
  $('shopTitle').textContent = `${s.E.name.toUpperCase()} MARKET`;
  $('shopCoins').textContent = `$${coins}  HP ${s.hp}/${s.P.maxHp}`;
  if (shop.picked && !s.owned[shop.picked]) shop.picked = null;
  $('shopLoadout').innerHTML = backpackHtml(s, true, shop.picked);
  $('pieceRow').hidden = !shop.picked;
  if (shop.picked) {
    $('sellBtn').textContent = `Sell ${UPGRADE[shop.picked].name} ${TIERS[s.owned[shop.picked]]} for $${s.refundFor(shop.picked)}`;
    $('turnBtn').hidden = turns(cellsOf(SHAPES[UPGRADE[shop.picked].shape])).length < 2; // 1x1 and 2x2 look the same turned
  }
  $('shopItems').replaceChildren(...shop.offers.map((u, i) => {
    const cost = priceOf(u, s.owned), sold = shop.sold.has(i), kind = s.buyKind(u), refund = kind === 'swap' ? s.refundFor(s.P.active.id) : 0;
    const what = {
      merge: `Merges into tier ${TIERS[(s.owned[u.id] || 0) + 1]}`, fit: u.active ? '' : 'Fits in your backpack',
      repack: 'Fits if your backpack is rearranged (it will be, if you buy it)',
      swap: `Replaces your ${s.P.active?.name} (+$${refund} back)`, max: 'Max tier',
      room: 'No room in your backpack: sell something first', companions: 'You already have two companions: sell one first',
    }[kind];
    const b = document.createElement('button');
    b.className = `card${sold ? ' sold' : ''}`;
    b.dataset.buy = i;
    b.disabled = sold || !['merge', 'fit', 'repack', 'swap'].includes(kind) || cost > coins + refund;
    b.innerHTML = `<span class="tag">${u.active ? 'ACTIVE ITEM' : `${SHAPE_NAMES[u.shape]} PIECE`} &middot; ${u.era ? `${ERA[u.era].name.toUpperCase()} ONLY` : 'ANY TIMELINE'}</span>`
      + `<b>${u.active ? '' : `${shapeHtml(u)} `}${u.name}</b><span class="price">${sold ? 'SOLD' : `$${cost}`}</span><small>${u.desc}</small>`
      + `${what ? `<span class="combo">${what}</span>` : ''}${comboHint(u, s.owned)}`;
    return b;
  }));
  const rerollCost = 3 + 2 * shop.rerolls;
  $('rerollBtn').textContent = `Reroll $${rerollCost}`;
  $('rerollBtn').disabled = rerollCost > coins;
  $('healBtn').textContent = `Coffee +1 HP $${shop.healPrice}`;
  $('healBtn').disabled = shop.healPrice > coins || s.hp >= s.P.maxHp;
  $('shopBuild').textContent = combosText(s).trim() || 'No combos yet: pair gear from different timelines.';
}
function shopBuy(i) {
  const s = scene(), u = app.shop.offers[i], swapped = s.buyKind(u) === 'swap' ? s.P.active : null, refund = swapped ? s.refundFor(swapped.id) : 0, had = s.combos;
  const unlocked = s.buy(u);
  if (!unlocked) return renderShop();
  app.shop.sold.add(i);
  const lost = had.filter(c => !s.combos.includes(c));
  const notes = [swapped && `Sold your ${swapped.name} for $${refund}.`, lost.length && `Lost combo: ${lost.map(c => c.name).join(', ')}.`,
    unlocked.length && `COMBO UNLOCKED: ${unlocked.map(c => `${c.name} (${c.desc})`).join(' ')}`].filter(Boolean);
  if (notes.length) $('shopNote').textContent = notes.join(' ');
  if (unlocked.length) jingle([523, 659, 784, 1046, 1318]);
  else beep(880, 60);
  renderShop();
}
// Arranging the backpack in the shop: drag a piece to move it (a green or red outline shows where it would land), tap
// one to pick it, then Turn or Sell it.
let packDrag = null;
const packBox = () => $('shopLoadout').querySelector('.backpack');
function packCell(e) {
  const box = packBox().getBoundingClientRect();
  return [Math.floor((e.clientX - box.left) / (box.width / BACKPACK.w)), Math.floor((e.clientY - box.top) / (box.height / scene().packRows))];
}
function showLanding(cells, ok) {
  const box = packBox();
  box.querySelectorAll('.landing').forEach(g => g.remove());
  for (const [x, y] of cells) {
    if (x >= 0 && y >= 0 && x < BACKPACK.w && y < scene().packRows) box.insertAdjacentHTML('beforeend', `<div class="landing${ok ? '' : ' bad'}" style="grid-area:${y + 1}/${x + 1}"></div>`);
  }
  box.querySelector(`[data-piece="${packDrag.id}"]`)?.classList.add('dragging');
}
$('shopLoadout').addEventListener('pointerdown', e => {
  const piece = e.target.closest('[data-piece]');
  if (!piece || app.state !== 'shop') return;
  e.preventDefault();
  const cells = scene().pack[piece.dataset.piece], [gx, gy] = packCell(e);
  const x0 = Math.min(...cells.map(c => c[0])), y0 = Math.min(...cells.map(c => c[1]));
  packDrag = { id: piece.dataset.piece, start: [gx, gy], grab: [gx - x0, gy - y0], to: null };
  $('shopLoadout').setPointerCapture(e.pointerId);
});
$('shopLoadout').addEventListener('pointermove', e => {
  if (!packDrag) return;
  const [gx, gy] = packCell(e);
  if (!packDrag.to && gx === packDrag.start[0] && gy === packDrag.start[1]) return; // still a tap
  const s = scene(), cells = s.pack[packDrag.id], x0 = Math.min(...cells.map(c => c[0])), y0 = Math.min(...cells.map(c => c[1]));
  const dx = gx - packDrag.grab[0] - x0, dy = gy - packDrag.grab[1] - y0;
  packDrag.to = cells.map(([x, y]) => [x + dx, y + dy]);
  showLanding(packDrag.to, s.canPlace(packDrag.id, packDrag.to));
});
$('shopLoadout').addEventListener('pointerup', () => {
  if (!packDrag) return;
  const { id, to } = packDrag;
  packDrag = null;
  if (!to) app.shop.picked = app.shop.picked === id ? null : id; // a tap: pick it (or put it down)
  else if (scene().movePiece(id, to)) { app.shop.picked = id; beep(660, 40); }
  renderShop();
});
$('shopLoadout').addEventListener('pointercancel', () => { packDrag = null; renderShop(); });
function shopTurn() {
  if (!app.shop.picked) return;
  if (scene().turnPiece(app.shop.picked)) beep(700, 40);
  else $('shopNote').textContent = 'No room to turn it: move something out of the way first.';
  renderShop();
}
// Tap a piece to pick it (the sell button shows its price), tap the sell button to sell it.
function shopSell() {
  const s = scene(), id = app.shop.picked, refund = s.refundFor(id), had = s.combos;
  if (!id) return;
  s.sell(id);
  app.shop.picked = null;
  const lost = had.filter(c => !s.combos.includes(c));
  $('shopNote').textContent = `Sold your ${UPGRADE[id].name} for $${refund}.` + (lost.length ? ` Lost combo: ${lost.map(c => c.name).join(', ')}.` : '');
  beep(520, 60);
  renderShop();
}
function shopReroll() {
  const s = scene(), cost = 3 + 2 * app.shop.rerolls;
  if (s.coins < cost) return;
  s.coins -= cost;
  app.shop.rerolls++;
  app.shop.offers = s.rollOffers();
  app.shop.sold = new Set();
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
  if (btn.dataset.piece !== undefined) { // (taps and drags are handled above; this is Enter or Space on a piece)
    if (e.detail === 0) app.shop.picked = app.shop.picked === btn.dataset.piece ? null : btn.dataset.piece;
    return renderShop();
  }
  if (btn.dataset.board) return openBoard(btn.dataset.board);
  const action = btn.dataset.action;
  if (action === 'play') showStory();
  else if (action === 'daily') startDaily();
  else if (action === 'board') openBoard();
  else if (action === 'signin') signIn();
  else if (action === 'signout') account.signOut();
  else if (action === 'rename') openName();
  else if (action === 'saveName') saveName();
  else if (action === 'start') startGame($('seedInput').value);
  else if (action === 'again') app.daily ? startDaily() : startGame();
  else if (action === 'resume') resumeGame();
  else if (action === 'menu') toMenu();
  else if (action === 'settings') openSettings();
  else if (action === 'back') showScreen(app.settingsFrom);
  else if (action === 'reroll') shopReroll();
  else if (action === 'heal') shopHeal();
  else if (action === 'sell') shopSell();
  else if (action === 'turn') shopTurn();
  else if (action === 'continue') closeShop();
  else if (action === 'home') choose(false);
  else if (action === 'endless') choose(true);
});
$('pauseBtn').addEventListener('click', pauseGame);
$('itemBtn').addEventListener('click', () => scene()?.useActive());
for (const r of document.querySelectorAll('input[name=graphics]')) { // 2D or 3D (beta): switches straight away, even mid-run
  r.checked = r.value === settings.graphics;
  r.addEventListener('change', () => { settings.graphics = r.value; saveSettings(); });
}
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
