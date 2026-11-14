// Rewind Patrol game data: timelines, stages, difficulty, upgrades and combos. Loaded first; no game logic here
// except the two pure helpers at the bottom (stats from upgrades, prices).

// ponytail: one fixed portrait screen, like a vertical arcade cabinet. Desktop gets it letterboxed; phones fill the width.
const W = 600, H = 900;
const FONT = '"Press Start 2P", monospace';
const ROAD_SPEED = 90; // pixels per second the road slides past: Vega is always walking forward
const STAGES_PER_ERA = 10;
// Bonus levels (vehicle chases between levels) are seen from the side: sky and hills on top, the ground band below
// where everything races right.
const GROUND_Y = 430, BAND_TOP = 470, GROUND_SPEED = 300;
const BONUS_TIME = 45000; // how long a bonus level lasts, in ms
const BONUS_CHANCE = 0.5; // chance that a mini-boss level leads into a bonus level (chase or escape, 50/50)
const COIN_CHANCE = 0.2; // chance that a defeated enemy drops a coin

// Seven timelines. Each run's seed picks 5 of them, in a random order, for stages 1-50 (10 stages each). Stage 5 of
// each has a mid-boss, stage 10 the timeline's boss, who holds one of the missing time-drive parts. Every stage opens
// with a card naming the timeline. After stage 50 you can go home or keep going (endless): every 10 stages the seed
// picks another timeline. Toughness comes from how far along you are (see Play.enemyHp/bossHp), not from the timeline.
// Each timeline's `army` names the sprite for each soldier type (see ROLES). Vehicle stages use the timeline's
// `vehicle`, `rider` colors (swapped onto Vega's side-view sprite), `sky` and `obstacle`.
const TIMELINES = 5, FINAL_STAGE = TIMELINES * STAGES_PER_ERA;
const ERAS = [
  { id: 'rome', name: 'Rome', year: '44 BC', road: 'road-rome', bg: 0x2a120f, lines: 0xffb070, army: { G: 'legionary', S: 'sagittarius', H: 'praetorian', C: 'gladiator' },
    shot: 'spear',
    part: 'QUARTZ CORE', vehicle: 'chariot', rider: { 9: '4', G: '2', 5: '6' }, sky: 0x9a5a3a, obstacle: 'rock',
    mid: { key: 'champion', name: 'THE ARENA\nCHAMPION', shot: 'spear' },
    boss: { key: 'centurion', name: 'THE IRON\nCENTURION', shot: 'orb' } },
  { id: 'england', name: 'England', year: '1250 AD', road: 'road-england', bg: 0x0e1a14, lines: 0x9fe0a0, army: { G: 'knight', S: 'longbowman', H: 'maceknight', C: 'pikeman' },
    shot: 'arrow',
    part: 'TAPE REEL', vehicle: 'horse', rider: { 9: '6', G: '3', 5: '6' }, sky: 0x5c7fa8, obstacle: 'rock',
    mid: { key: 'siege', name: 'THE SIEGE\nENGINE', shot: 'boulder' },
    boss: { key: 'grimhelm', name: 'SIR GRIMHELM', shot: 'orb' } },
  { id: 'caribbean', name: 'The Caribbean', year: '1715 AD', road: 'road-caribbean', bg: 0x071a2e, lines: 0x7fd0ff, army: { G: 'pirate', S: 'musketeer', H: 'powderbrute', C: 'swashbuckler' },
    shot: 'cannonball',
    part: 'SIREN COIL', vehicle: 'boat', rider: { 9: '2', G: 'E', 5: '5' }, sky: 0x4fa3c7, obstacle: 'barrel',
    mid: { key: 'kraken', name: 'THE KRAKEN', shot: 'ink' },
    boss: { key: 'blackpowder', name: 'CAPTAIN\nBLACKPOWDER', shot: 'orb' } },
  { id: 'west', name: 'The Wild West', year: '1881 AD', road: 'road-west', bg: 0x3a2412, lines: 0xffc070, army: { G: 'outlaw', S: 'rifleman', H: 'bruiser', C: 'bandito' },
    shot: 'bullet',
    part: 'CHROME DIAL', vehicle: 'horse', rider: { 9: '7', G: 'D', 5: '5' }, sky: 0xc8723c, obstacle: 'cactus',
    mid: { key: 'gatling', name: 'THE GATLING\nWAGON', shot: 'bullet' },
    boss: { key: 'rattler', name: 'COLONEL\nRATTLER', shot: 'orb' } },
  { id: 'japan', name: 'Feudal Japan', year: '1600 AD', road: 'road-japan', bg: 0x1a1428, lines: 0xffb7d5, army: { G: 'ninja', S: 'yumi', H: 'samurai', C: 'ashigaru' },
    shot: 'shuriken',
    part: 'NEON TUBE', vehicle: 'horse', rider: { 9: '9', G: 'E', 5: '6' }, sky: 0x8aa0c8, obstacle: 'rock',
    mid: { key: 'oni', name: 'THE ONI', shot: 'shuriken' },
    boss: { key: 'shogun', name: 'THE IRON\nSHOGUN', shot: 'orb' } },
  { id: 'norse', name: 'Scandinavia', year: '900 AD', road: 'road-norse', bg: 0x14202c, lines: 0xcfe8ff, army: { G: 'viking', S: 'spearthrower', H: 'huscarl', C: 'raider' },
    shot: 'axe',
    part: 'MAGNET RING', vehicle: 'boat', rider: { 9: '6', G: '7', 5: '6' }, sky: 0x9ab4cc, obstacle: 'iceberg',
    mid: { key: 'berserker', name: 'THE BERSERKER', shot: 'axe' },
    boss: { key: 'frostgiant', name: 'THE FROST\nGIANT', shot: 'orb' } },
  { id: 'stone', name: 'The Stone Age', year: '10,000 BC', road: 'road-stone', bg: 0x16260f, lines: 0xb0ff80, army: { G: 'caveman', S: 'slinger', H: 'clubbrute', C: 'sabretooth' },
    shot: 'stone',
    part: 'CRYSTAL CHIP', vehicle: 'raptor', rider: { 9: '7', G: 'D', 5: '7' }, sky: 0xb07a50, obstacle: 'rock',
    mid: { key: 'mammoth', name: 'THE WOOLLY\nMAMMOTH', shot: 'stone' },
    boss: { key: 'trex', name: 'THE KING\nLIZARD', shot: 'orb' } },
];
const ERA = Object.fromEntries(ERAS.map(e => [e.id, e]));

// Soldier types. Every army has all four. Health is the run's base toughness (Play.enemyHp) times `hp`, so some take
// far more hits than others; `score` multiplies the points. Heavies always drop a coin.
const ROLES = {
  C: { name: 'charger', hp: 0.5, score: 1 },        // never shoots: shakes for a moment, then charges at Vega
  S: { name: 'sharpshooter', hp: 1, score: 1.5 },   // flashes red, then fires a fast shot aimed straight at Vega
  G: { name: 'grunt', hp: 1.5, score: 1 },          // the rank and file: lobs shots roughly Vega's way
  H: { name: 'heavy', hp: 4, score: 3, coin: true }, // big and slow to kill: fires a 3-shot spread
};

// What each non-boss wave of a timeline throws at you, drawn with the ROLES letters ('.' = a gap):
// `formation` rows fly in and sway (top row = back row), `stream` lines snake down the screen one soldier at a time.
// Level 1 brings in one new soldier type per wave; level 2 mixes them all, busier towards the boss (waves 5 and 10).
const STAGES = {
  1: { formation: ['GGGGGG', 'GGGGGG', 'GGGGGG'] },
  2: { stream: ['GGGGGGGG', 'CCCCCCCC'] },
  3: { formation: ['SSSSSSS', 'GGGGGGG', 'GGGGGGG', 'CCCCCCC'] },
  4: { formation: ['SGSGSGS', 'GGGGGGG', '.H.H.H.'], stream: ['CCCCCCCC'] },
  6: { formation: ['SSSSSS', 'H.HH.H'], stream: ['GGGGGGGG', 'CCCCCCCC', 'GGGGGGGG'] },
  7: { formation: ['SSSSSSS', 'GGGGGGG', 'GCGCGCG', 'GGGGGGG', 'H.H.H.H'] },
  8: { formation: ['SSSSSSS', 'CCCCCCC', 'CCCCCCC', '.H.H.H.'], stream: ['GGGGGGGG'] },
  9: { formation: ['SSSSSSS', 'GGGGGGG', 'HGHGHGH'], stream: ['CCCCCCC', 'GGGGGGG'] },
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
  sixShooter: 0, dynamite: 0, burn: 0, orbitals: 0, orbitRadius: 70, orbitSpeed: 3, lowHpDmg: 0, berserk: 0,
  axes: 0, axesReturn: false, boomerangs: 0, regen: 0, stageShield: false, stampedeMult: 1, dynamiteBurns: false,
};

// General gear is sold in every timeline; timeline gear only in its own timeline, so each run's mix depends on
// where you've been. `heal` heals that much on purchase.
// Active items (`active`) charge up as you defeat enemies, then fire with the item button. Vega holds one at a time:
// buying another swaps it out.
const UPGRADES = [
  { id: 'airsupport', name: 'Air Support Radio', active: { charge: 40, effect: 'clear' }, price: 20, max: 1,
    desc: 'Active, charges with 40 kills: an air strike wipes out every enemy on screen. Bosses take a big hit.' },
  { id: 'remote', name: 'VCR Remote', active: { charge: 60, effect: 'skip' }, price: 24, max: 1,
    desc: 'Active, charges with 60 kills: fast-forward past the current wave. Not on boss waves or bonus levels.' },
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

  { id: 'sixshooter', era: 'west', name: 'Six-Shooter', desc: 'Every 6th shot, fan out 6 extra bullets.', price: 14, max: 1, apply: p => { p.sixShooter = 6; } },
  { id: 'dynamite', era: 'west', name: 'Dynamite', desc: 'Enemies you take down blow up, hurting the ones nearby.', price: 18, max: 2, apply: p => { p.dynamite += 1; } },
  { id: 'deadeye', era: 'west', name: 'Deadeye', desc: '+15% critical chance, and crits deal 4x.', price: 14, max: 1, apply: p => { p.crit += 0.15; p.critMult = 4; } },
  { id: 'stampede', era: 'west', name: 'Stampede', active: { charge: 35, effect: 'stampede' }, price: 18, max: 1,
    desc: 'Active, charges with 35 kills: a cattle stampede thunders up the screen, trampling everything.' },

  { id: 'shuriken', era: 'japan', name: 'Shuriken Ring', desc: '2 throwing stars circle you, cutting enemies and blocking shots.', price: 18, max: 2, apply: p => { p.orbitals += 2; } },
  { id: 'bushido', era: 'japan', name: 'Bushido', desc: '+80% damage while on your last HP.', price: 10, max: 1, apply: p => { p.lowHpDmg += 0.8; } },
  { id: 'ninjastep', era: 'japan', name: 'Ninja Step', desc: 'Stay untouchable 40% longer after a hit, and move 15% faster.', price: 10, max: 2, apply: p => { p.invuln *= 1.4; p.moveSpeed *= 1.15; } },
  { id: 'blossom', era: 'japan', name: 'Petal Storm', active: { charge: 30, effect: 'blossom' }, price: 18, max: 1,
    desc: 'Active, charges with 30 kills: a storm of razor petals cuts every enemy on screen and wipes out their shots.' },

  { id: 'axes', era: 'norse', name: 'Throwing Axes', desc: 'Throw a spinning axe that cuts through everything, every 1.5 s (faster with each copy).', price: 16, max: 2, apply: p => { p.axes += 1; } },
  { id: 'berserk', era: 'norse', name: 'Berserker Rage', desc: 'Fire 15% faster for every HP you are missing.', price: 12, max: 1, apply: p => { p.berserk = 0.15; } },
  { id: 'hearth', era: 'norse', name: 'Hearth Fire', desc: 'Heal 2 HP every time you finish a level.', price: 16, max: 1, apply: p => { p.regen = 2; } },
  { id: 'thunder', era: 'norse', name: 'Thunder Hammer', active: { charge: 30, effect: 'thunder' }, price: 18, max: 1,
    desc: 'Active, charges with 30 kills: 10 lightning bolts strike your enemies (and bosses).' },

  { id: 'fire', era: 'stone', name: 'Fire', desc: 'Your shots set enemies alight: they keep burning for 3 s.', price: 16, max: 2, apply: p => { p.burn += 1; } },
  { id: 'boomerang', era: 'stone', name: 'Bone Boomerang', desc: 'Every 2 s a boomerang flies out and comes back, cutting through everything.', price: 14, max: 2, apply: p => { p.boomerangs += 1; } },
  { id: 'hide', era: 'stone', name: 'Mammoth Hide', desc: '+2 max HP (heals 2), but move 10% slower.', price: 16, max: 1, heal: 2, apply: p => { p.maxHp += 2; p.moveSpeed *= 0.9; } },
  { id: 'meteor', era: 'stone', name: 'Meteor Shower', active: { charge: 35, effect: 'meteor' }, price: 18, max: 1,
    desc: 'Active, charges with 35 kills: meteors rain down on your enemies for 3 s.' },
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
  { id: 'gunslinger', name: 'Gunslinger', needs: ['sixshooter', 'barrel'], desc: 'The Six-Shooter fans out 12 bullets.', apply: p => { p.sixShooter = 12; } },
  { id: 'chainreaction', name: 'Chain Reaction', needs: ['dynamite', 'cannon'], desc: 'Dynamite blasts are twice as big.', apply: p => { p.dynamite *= 2; } },
  { id: 'wildfire', name: 'Wildfire', needs: ['dynamite', 'fire'], desc: 'Dynamite blasts set everything they hit on fire.', apply: p => { p.burn = Math.max(p.burn, 1); p.dynamiteBurns = true; } },
  { id: 'firearrows', name: 'Fire Arrows', needs: ['fire', 'longbow'], desc: 'Burning damage is doubled.', apply: p => { p.burn *= 2; } },
  { id: 'whirlwind', name: 'Whirlwind', needs: ['shuriken', 'ricochet'], desc: 'Throwing stars circle wider and twice as fast.', apply: p => { p.orbitRadius = 100; p.orbitSpeed = 6; } },
  { id: 'laststand', name: 'Last Stand', needs: ['bushido', 'berserk'], desc: 'On your last HP, damage and fire rate double again.', apply: p => { p.lowHpDmg += 1; p.berserk = 0.3; } },
  { id: 'returnaxe', name: 'Returning Axes', needs: ['axes', 'boomerang'], desc: 'Throwing axes come back like boomerangs.', apply: p => { p.axesReturn = true; } },
  { id: 'megastampede', name: 'Mammoth Stampede', needs: ['stampede', 'hide'], desc: 'Stampede deals double damage.', apply: p => { p.stampedeMult = 2; } },
  { id: 'shieldmaiden', name: 'Shield Maiden', needs: ['hearth', 'scutum'], desc: 'Finishing a level also refills your shield.', apply: p => { p.stageShield = true; } },
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
