// Rewind Patrol game data: timelines, stages, difficulty, upgrades and combos. Loaded first; no game logic here
// except the two pure helpers at the bottom (stats from upgrades, prices).

// ponytail: one fixed portrait screen, like a vertical arcade cabinet. Desktop gets it letterboxed; phones fill the width.
const W = 600, H = 900;
const FONT = '"Press Start 2P", monospace';
const ROAD_SPEED = 90; // pixels per second the road slides past: Vega is always walking forward
const STAGES_PER_ERA = 10;
// Vehicle stages are seen from the side: sky and hills on top, the ground band below where everything races right.
const GROUND_Y = 430, BAND_TOP = 470, GROUND_SPEED = 300;

// Three timelines of 10 stages each. Stage 5 of each has a mid-boss, stage 10 the timeline's boss,
// who holds one of the missing time-drive parts. Every stage opens with a card naming the timeline.
// Vehicle stages use the timeline's `vehicle`, `rider` colors (swapped onto Vega's side-view sprite), `sky` and `obstacle`.
const ERAS = [
  { id: 'rome', name: 'Rome', year: '44 BC', road: 'road-rome', bg: 0x2a120f, lines: 0xffb070, enemy: 'legionary', shot: 'spear', hp: 1,
    part: 'QUARTZ CORE', vehicle: 'chariot', rider: { 9: '4', G: '2', 5: '6' }, sky: 0x9a5a3a, obstacle: 'rock',
    mid: { key: 'champion', name: 'THE ARENA\nCHAMPION', hp: 50, shot: 'spear' },
    boss: { key: 'centurion', name: 'THE IRON\nCENTURION', hp: 90, shot: 'orb' } },
  { id: 'england', name: 'England', year: '1250 AD', road: 'road-england', bg: 0x0e1a14, lines: 0x9fe0a0, enemy: 'knight', shot: 'arrow', hp: 2,
    part: 'TAPE REEL', vehicle: 'horse', rider: { 9: '6', G: '3', 5: '6' }, sky: 0x5c7fa8, obstacle: 'rock',
    mid: { key: 'siege', name: 'THE SIEGE\nENGINE', hp: 80, shot: 'boulder' },
    boss: { key: 'grimhelm', name: 'SIR GRIMHELM', hp: 140, shot: 'orb' } },
  { id: 'caribbean', name: 'The Caribbean', year: '1715 AD', road: 'road-caribbean', bg: 0x071a2e, lines: 0x7fd0ff, enemy: 'pirate', shot: 'cannonball', hp: 2,
    part: 'SIREN COIL', vehicle: 'boat', rider: { 9: '2', G: 'E', 5: '5' }, sky: 0x4fa3c7, obstacle: 'barrel',
    mid: { key: 'kraken', name: 'THE KRAKEN', hp: 110, shot: 'ink' },
    boss: { key: 'blackpowder', name: 'CAPTAIN\nBLACKPOWDER', hp: 190, shot: 'orb' } },
];
const ERA = Object.fromEntries(ERAS.map(e => [e.id, e]));

// What each non-boss stage of a timeline throws at you: a formation [rows, cols] that flies in and sways,
// snaking lines [lines, per line], and/or dive-bombers peeling off the formation. It gets busier towards the boss.
// Stages 3 and 8 are side-view vehicle stages: a chase (you shoot ahead) and an escape (you're chased and shoot back).
const STAGES = {
  1: { formation: [3, 6] },
  2: { stream: [2, 8] },
  3: { vehicle: 'chase', riders: 10 },
  4: { formation: [4, 7], divers: true },
  6: { stream: [3, 8] },
  7: { formation: [5, 7] },
  8: { vehicle: 'escape', riders: 12 },
  9: { formation: [3, 7], stream: [2, 6], divers: true },
};

const DIFFICULTY = {
  easy:   { label: 'Easy',   hp: 5, fire: 0.6, shotSpeed: 200, bossHp: 0.8 },
  normal: { label: 'Normal', hp: 3, fire: 1,   shotSpeed: 250, bossHp: 1 },
  hard:   { label: 'Hard',   hp: 3, fire: 1.5, shotSpeed: 310, bossHp: 1.3 },
};

// ---------- Roguelike upgrades ----------
// Vega's stats at the start of every run (maxHp comes from the difficulty). Upgrades bought in the shop change them.
const BASE_STATS = {
  dmg: 1, fireDelay: 220, shots: 1, bulletSpeed: 720, pierce: 0, bounce: 0,
  crit: 0, critMult: 3, bossDmg: 1, bossCritMult: 0, fullHpDmg: 0,
  moveSpeed: 560, invuln: 1500, armor: 0, shieldMax: 0, shieldRecharge: 10000,
  magnet: 70, coinMult: 1, partners: 0, partnerPierce: 0,
  longbowEvery: 0, cannons: 0, cannonRadius: 75, cannonBounce: 0, cannonBossMult: 1,
  active: null, chargeMult: 1, broadside: 12, testudoMs: 6000, testudoShield: false, // active items
};

// General gear is sold in every timeline; timeline gear only in its own timeline, so each run's mix depends on
// where you've been. `heal` heals that much on purchase.
// Active items (`active`) charge up as you defeat enemies, then fire with the item button. Vega holds one at a time:
// buying another swaps it out.
const UPGRADES = [
  { id: 'airsupport', name: 'Air Support Radio', active: { charge: 40, effect: 'clear' }, price: 20, max: 1,
    desc: 'Active, charges with 40 kills: an air strike wipes out every enemy on screen. Bosses take a big hit.' },
  { id: 'remote', name: 'VCR Remote', active: { charge: 60, effect: 'skip' }, price: 24, max: 1,
    desc: 'Active, charges with 60 kills: fast-forward. The stage counts as cleared and you go to the shop. Not on boss stages.' },
  { id: 'siren', name: 'Police Siren', active: { charge: 25, effect: 'freeze' }, price: 14, max: 1,
    desc: 'Active, charges with 25 kills: enemies freeze and their shots vanish for 5 s.' },
  { id: 'testudo', era: 'rome', name: 'Testudo', active: { charge: 30, effect: 'invuln' }, price: 16, max: 1,
    desc: 'Active, charges with 30 kills: nothing can hurt you for 6 s.' },
  { id: 'trebuchet', era: 'england', name: 'Trebuchet Call', active: { charge: 35, effect: 'trebuchet' }, price: 18, max: 1,
    desc: 'Active, charges with 35 kills: a boulder crashes down mid-screen in a huge blast. Great on bosses.' },
  { id: 'broadside', era: 'caribbean', name: 'Broadside', active: { charge: 30, effect: 'broadside' }, price: 18, max: 1,
    desc: 'Active, charges with 30 kills: fire 12 exploding cannonballs in a wide fan.' },

  { id: 'rapid', name: 'Rapid Fire', desc: 'Fire 20% faster.', price: 10, max: 5, apply: p => { p.fireDelay *= 0.8; } },
  { id: 'magnum', name: 'Magnum Rounds', desc: '+50% damage.', price: 14, max: 4, apply: p => { p.dmg += 0.5; } },
  { id: 'barrel', name: 'Extra Barrel', desc: '+1 bullet per shot, fanned out.', price: 16, max: 4, apply: p => { p.shots += 1; } },
  { id: 'vest', name: 'Kevlar Vest', desc: '+1 max HP, and heals 1.', price: 14, max: 4, heal: 1, apply: p => { p.maxHp += 1; } },
  { id: 'sneakers', name: 'Running Shoes', desc: 'Move 20% faster.', price: 8, max: 3, apply: p => { p.moveSpeed *= 1.2; } },
  { id: 'detector', name: 'Metal Detector', desc: 'Pull in coins from 60% farther away.', price: 6, max: 3, apply: p => { p.magnet *= 1.6; } },
  { id: 'lucky', name: 'Lucky Badge', desc: '+10% chance of a 3x critical hit.', price: 12, max: 3, apply: p => { p.crit += 0.1; } },
  { id: 'partner', name: 'Backup Partner', desc: 'A partner walks beside you and shoots too.', price: 22, max: 2, apply: p => { p.partners += 1; } },

  { id: 'pilum', era: 'rome', name: 'Pilum', desc: 'Shots pierce through 1 more enemy.', price: 14, max: 2, apply: p => { p.pierce += 1; } },
  { id: 'scutum', era: 'rome', name: 'Scutum', desc: 'A shield that blocks 1 hit, recharging every 10 s.', price: 18, max: 2, apply: p => { p.shieldMax += 1; } },
  { id: 'aquila', era: 'rome', name: 'Aquila Standard', desc: '+40% damage while at full HP.', price: 12, max: 2, apply: p => { p.fullHpDmg += 0.4; } },

  { id: 'longbow', era: 'england', name: 'Longbow', desc: 'Every 4th shot adds an arrow that pierces everything for 3x damage.', price: 16, max: 1, apply: p => { p.longbowEvery = 4; } },
  { id: 'plate', era: 'england', name: 'Plate Armor', desc: '+1 max HP and a 20% chance to shrug off a hit. Heals 1.', price: 16, max: 2, heal: 1, apply: p => { p.maxHp += 1; p.armor += 0.2; } },
  { id: 'crossbow', era: 'england', name: 'Crossbow Bolts', desc: '+60% damage to bosses.', price: 12, max: 2, apply: p => { p.bossDmg += 0.6; } },

  { id: 'cannon', era: 'caribbean', name: "Ship's Cannon", desc: 'Fires an exploding cannonball every 2 s (more often with each copy).', price: 18, max: 3, apply: p => { p.cannons += 1; } },
  { id: 'ricochet', era: 'caribbean', name: 'Ricochet', desc: 'Shots bounce off the edges of the screen once more.', price: 12, max: 2, apply: p => { p.bounce += 1; } },
  { id: 'map', era: 'caribbean', name: 'Treasure Map', desc: '+50% coins.', price: 10, max: 2, apply: p => { p.coinMult += 0.5; } },
];
const UPGRADE = Object.fromEntries(UPGRADES.map(u => [u.id, u]));

// Owning both halves of a combo unlocks a bonus on top. Most pair gear from two different timelines.
const COMBOS = [
  { id: 'volley', name: 'Volley Fire', needs: ['pilum', 'longbow'], desc: 'Longbow arrows every 2nd shot.', apply: p => { p.longbowEvery = 2; } },
  { id: 'pinball', name: 'Pinball', needs: ['pilum', 'ricochet'], desc: 'Shots bounce one extra time.', apply: p => { p.bounce += 1; } },
  { id: 'skipping', name: 'Skipping Shot', needs: ['cannon', 'ricochet'], desc: 'Cannonballs bounce off the edges twice.', apply: p => { p.cannonBounce += 2; } },
  { id: 'fortress', name: 'Fortress', needs: ['scutum', 'plate'], desc: 'Shield recharges twice as fast.', apply: p => { p.shieldRecharge /= 2; } },
  { id: 'battery', name: 'Siege Battery', needs: ['cannon', 'crossbow'], desc: 'Cannonballs deal triple damage to bosses.', apply: p => { p.cannonBossMult = 3; } },
  { id: 'xmarks', name: 'X Marks the Spot', needs: ['map', 'detector'], desc: 'Coins worth +50% more, pulled in from anywhere.', apply: p => { p.coinMult += 0.5; p.magnet = 9999; } },
  { id: 'ironwill', name: 'Iron Will', needs: ['aquila', 'vest'], desc: 'The full-HP damage bonus is doubled.', apply: p => { p.fullHpDmg *= 2; } },
  { id: 'archer', name: 'Archer Partner', needs: ['partner', 'longbow'], desc: 'Partners shoot piercing arrows.', apply: p => { p.partnerPierce = 99; } },
  { id: 'bullseye', name: 'Bullseye', needs: ['lucky', 'crossbow'], desc: 'Critical hits on bosses deal 5x.', apply: p => { p.bossCritMult = 5; } },
  { id: 'fullbroadside', name: 'Full Broadside', needs: ['broadside', 'cannon'], desc: 'Broadside fires 20 cannonballs.', apply: p => { p.broadside = 20; } },
  { id: 'shieldwall', name: 'Shield Wall', needs: ['testudo', 'scutum'], desc: 'Testudo lasts 10 s and refills your shield.', apply: p => { p.testudoMs = 10000; p.testudoShield = true; } },
  { id: 'gunship', name: 'Gunship', needs: ['airsupport', 'partner'], desc: 'Air Support charges twice as fast.', apply: p => { p.chargeMult = 2; } },
];

// Vega's stats from the upgrades owned ({ id: copies }). Combos apply after every upgrade, so they can scale them.
function computeStats(owned, maxHp) {
  const stats = { ...BASE_STATS, maxHp };
  for (const u of UPGRADES) for (let i = 0; i < (owned[u.id] || 0); i++) u.apply?.(stats);
  stats.active = UPGRADES.find(u => u.active && owned[u.id]) ?? null;
  const combos = COMBOS.filter(c => c.needs.every(id => owned[id]));
  for (const c of combos) c.apply(stats);
  return { stats, combos };
}
// Each copy you already own makes the next one cost 50% more.
const priceOf = (u, owned) => Math.round(u.price * (1 + 0.5 * (owned[u.id] || 0)));
