// Rewind Patrol art: every sprite is rows of palette characters ('.' = transparent) that Phaser turns into textures,
// plus the top-down roads drawn with Graphics. No image files.

const PAL = {
  0: '#000000', 1: '#ffffff', 2: '#ff3b3b', 3: '#3b7bff', 4: '#ffd23b', 5: '#7d7d8c', 6: '#c8c8d4', 7: '#6b3e1f',
  8: '#f0b98a', 9: '#1b1b2f', A: '#ff4fd8', B: '#4ff0ff', C: '#2e8b3a', D: '#b5651d', E: '#8a1c1c', F: '#4b4b63',
  G: '#3a56d4', H: '#8b3fbf', I: '#c77dff',
};
const ART = {
  legionary: ['.....22.....', '....2222....', '...444444...', '..44888844..', '...408804...', '....8888....',
              '..E222222E..', '.4E222222E4.', '.4422222244.', '..22444422..', '...7....7...', '...7....7...'],
  knight: ['.....33.....', '....6666....', '...666666...', '..66666666..', '..60000006..', '..66666666..',
           '..33311333..', '.6333113336.', '.6311111136.', '..33311333..', '...5....5...', '...5....5...'],
  pirate: ['...222222...', '..22122122..', '..88888888..', '..80088808..', '..88888888..', '...877778...',
           '..1E1E1E1E..', '.81E1E1E1E8.', '.8E1E1E1E18.', '..1E1E1E1E..', '...9....9...', '...9....9...'],
  // Mid-bosses (stage 5 of each timeline)
  champion: ['........4444........', '.......444444.......', '......44444444......', '....DDDDDDDDDDDD....',
             '...DDDDDDDDDDDDDD...', '..DDD0606060606DDD..', '..DDD6060606060DDD..', '..DDD0606060606DDD..',
             '...DDDDDDDDDDDDDD...', '....DDDDDDDDDDDD....', '.......888888.......', '..8888887777888888..',
             '.888888877778888888.', '.888888877778888888.', '..4444444444444444..', '...EEEEEEEEEEEEEE...'],
  siege: ['........7777........', '.......755557.......', '........7777........', '.........77.........',
          '.........77.........', '..DDDDDDDDDDDDDDDD..', '..D77D77D77D77D77D..', '..DDDDDDDDDDDDDDDD..',
          '..D77777777777777D..', '..D77700777700777D..', '..D77700777700777D..', '..D77777777777777D..',
          '..DDDDDDDDDDDDDDDD..', '..D77777777777777D..', '..D77777700777777D..', '..DDDDDDDDDDDDDDDD..',
          '.55..55......55..55.'],
  kraken: ['.......HHHHHH.......', '.....HHHHHHHHHH.....', '....HHHIHHHHIHHH....', '...HHHHHHHHHHHHHH...',
           '...HHHHHHHHHHHHHH...', '...HH111HHHH111HH...', '...HH100HHHH001HH...', '...HHHHHHHHHHHHHH...',
           '....HHHHHHHHHHHH....', '..H.HH.HH..HH.HH.H..', '.H..H..H....H..H..H.', 'H..H..H......H..H..H',
           'I..I..I......I..I..I'],
  // Timeline bosses (stage 10 of each timeline): each one holds a missing time-drive part
  centurion: ['........2222........', '......22222222......', '.....2222222222.....', '......44444444......',
              '....444444444444....', '...44444444444444...', '...44488888888444...', '...44800888800844...',
              '...44888888888844...', '...44488888888444...', '....448888888844....', '.....4488EE8844.....',
              '......44888844......', '..EEEE22222222EEEE..', '.E4444222222224444E.', '.E4444222442224444E.',
              '..EEEE22222222EEEE..'],
  grimhelm: ['.5................5.', '.55..............55.', '..55..FFFFFFFF..55..', '...5FFFFFFFFFFFF5...',
             '....FFFFFFFFFFFF....', '...FFFFFFFFFFFFFF...', '...FF0000000000FF...', '...FF0220000220FF...',
             '...FF0000000000FF...', '...FFFFFFFFFFFFFF...', '...FF5F5F5F5F5FFF...', '....FFFFFFFFFFFF....',
             '.....FFFFFFFFFF.....', '..FFFFF666666FFFFF..', '.FFFFFF6EEEE6FFFFFF.', '.FFFFFF6EEEE6FFFFFF.',
             '..FFFFF666666FFFFF..'],
  blackpowder: ['.......000000.......', '....000001100000....', '..0000001111000000..', '.000000001100000000.',
                '44444444444444444444', '...88888888888888...', '...88008888880088...', '...88888888888888...',
                '...88888877888888...', '...77777777777777...', '...77770000007777...', '....777777777777....',
                '.....7777777777.....', '..EEEEE444444EEEEE..', '.EEEEEEE4444EEEEEEE.', '.EEEEEEEE44EEEEEEEE.'],
  // Enemy shots (point down)
  spear: ['.8.', '.8.', '.8.', '.8.', '.8.', '.8.', '.8.', '.6.', '666', '.6.'],
  arrow: ['1.1', '.1.', '.8.', '.8.', '.8.', '.8.', '.8.', '666', '.6.'],
  cannonball: ['.555.', '56655', '55555', '55555', '.555.'],
  boulder: ['.5555.', '556655', '565555', '555555', '555575', '.5555.'],
  ink: ['.HHHH.', 'HHIHHH', 'HIHHHH', 'HHHHHH', 'HHHHHH', '.HHHH.'],
  orb: ['.AAAA.', 'AA11AA', 'A1111A', 'A1111A', 'AA11AA', '.AAAA.'],
  // Vega's shots (point up)
  laser: ['11', 'BB', 'BB', 'BB', 'BB', 'BB'],
  arrowUp: ['.6.', '666', '.6.', '.8.', '.8.', '.8.', '.8.', '.8.', '.1.', '1.1'],
  // Pickups
  coin: ['.4444.', '441144', '414444', '444444', '444D44', '.4444.'],
  donut: ['..AAAAA..', '.A4AABAA.', 'AAA...A1A', 'AAA...AAA', '.DAAAAAD.', '..DDDDD..'],
  coffee: ['..1..1...', '...1..1..', '1111111..', '13333311.', '1333331.1', '13333311.', '1111111..', '.11111...'],
  part: ['...BBB...', '.B.BBB.B.', '..BBBBB..', 'BBB111BBB', 'BBB1A1BBB', 'BBB111BBB', '..BBBBB..', '.B.BBB.B.', '...BBB...'],
  spark: ['11', '11'],
  streak: ['1', '1', '1', '1'],
};
// Officer Vega seen from directly above, facing up: pistol held out front in both hands, arms, shoulders,
// and the police cap (black brim, gold badge). The feet are added separately so they can step.
const VEGA = [
  '......55......',
  '......55......',
  '......55......',
  '.....8888.....',
  '.....G..G.....',
  '.....G..G.....',
  '.....G..G.....',
  '..GGGGGGGGGG..',
  '.GGGG0000GGGG.',
  '.GGG994499GGG.',
  '.GGG999999GGG.',
  '.GGGG9999GGGG.',
  '..GGGGGGGGGG..',
  '...GGGGGGGG...',
  '..............',
  '..............',
];
// Put a 2x3 shoe at each [column, row]. Feet are under the body, so they only show where the body isn't.
const withFeet = feet => {
  const grid = VEGA.map(row => [...row]);
  for (const [c, r] of feet) {
    for (let y = 0; y < 3; y++) for (let x = 0; x < 2; x++) if (grid[r + y][c + x] === '.') grid[r + y][c + x] = '6';
  }
  return grid.map(row => row.join(''));
};
// Standing: just the toes poke out in front. Walking: one whole foot out front, the other's heel behind.
ART.vega0 = withFeet([[3, 5], [9, 5]]);
ART.vega1 = withFeet([[3, 2], [9, 13]]);
ART.vega2 = withFeet([[3, 13], [9, 2]]);
// The backup partner: a plainclothes detective in a brown jacket and hat.
ART.partner = ART.vega0.map(row => row.replace(/G/g, 'D').replace(/9/g, '7'));

const PIXEL = {
  vega0: 5, vega1: 5, vega2: 5, partner: 3, champion: 6, siege: 6, kraken: 6, centurion: 6, grimhelm: 6, blackpowder: 6,
  spear: 3, arrow: 3, cannonball: 3, ink: 3, orb: 3, laser: 3, arrowUp: 3, coin: 3, spark: 2, streak: 2,
};

// ---------- Side view (vehicle stages): riders on era vehicles, all facing right ----------
// Paint grids on top of each other: layers are [rows, column, row]; '.' leaves what's underneath.
function compose(width, height, layers) {
  const grid = Array.from({ length: height }, () => Array(width).fill('.'));
  for (const [rows, c0, r0] of layers) {
    rows.forEach((row, r) => [...row].forEach((ch, c) => { if (ch !== '.') grid[r0 + r][c0 + c] = ch; }));
  }
  return grid.map(row => row.join(''));
}
const mirror = rows => rows.map(row => [...row].reverse().join(''));
const recolor = (rows, map) => rows.map(row => row.replace(/./g, ch => map[ch] ?? ch));

// Vega from the side: cap, face, uniform, arm out front with the pistol. Mirrored, he looks (and shoots) backwards.
const RIDER = ['..9999..', '..999999', '..8808..', '..8888..', '.GGGG...', '.GGGGG85', '.GGGG...', '.GGGG...', '.FFFF...', '.F..F...'];
const HORSE_TOP = ['...............7D...', '..............7DDD..', '.............7DD0DD.', '............7DDDDDDD', '...........7DDD...DD',
  '..DDDDDDDDDDDDD.....', '.7DDDDDDDDDDDDD.....', '7.DDDDDDDDDDDDD.....', '7.DDDDDDDDDDDD......', '...DD.DD...DD.DD....'];
const HORSE = [ // two frames of legs: stretched out, then tucked under
  [...HORSE_TOP, '...D...D...D...D....', '..D.....D.D.....D...', '..0.....0.0.....0...'],
  [...HORSE_TOP, '....D.D.....D.D.....', '....D.D.....D.D.....', '....0.0.....0.0.....'],
];
const WHEEL = [
  ['..777..', '.7.7.7.', '7..7..7', '7777777', '7..7..7', '.7.7.7.', '..777..'],
  ['..777..', '.7...7.', '7.7.7.7', '7..7..7', '7.7.7.7', '.7...7.', '..777..'],
];
const CART = ['4444444444', '4EEEEEEEE4', '4EEEEEEEE4', '4444444444'];
const HULL = ['D......................D', 'DD....................DD', 'DDDDDDDDDDDDDDDDDDDDDDDD', '.7777777777777777777777.',
  '..DDDDDDDDDDDDDDDDDDDD..', '....77777777777777777...'];
const WAKE = ['.1..1..1..1..1..1..1..1.', '1..1..1..1..1..1..1..1..'];
// Each vehicle: a function turning (rider, frame) into one composed sprite.
const VEHICLES = {
  horse: (rider, f) => compose(20, 20, [[HORSE[f], 0, 7], [rider, 6, 3]]),
  chariot: (rider, f) => compose(28, 20, [[HORSE[f], 8, 7], [rider, 1, 3], [CART, 0, 10], [WHEEL[f], 2, 13]]),
  boat: (rider, f) => compose(24, 15, [[rider, 8, 0], [[...HULL, WAKE[f]], 0, 8]]),
};
// Riders for every timeline: Vega facing forward ('f') and looking back ('b'), and that timeline's enemy, both ways.
function makeRiders(eras) {
  for (const era of eras) {
    const enemy = recolor(RIDER, era.rider);
    for (const f of [0, 1]) {
      const build = VEHICLES[era.vehicle];
      Object.assign(ART, {
        [`ride-${era.id}-f${f}`]: build(RIDER, f), [`ride-${era.id}-b${f}`]: build(mirror(RIDER), f),
        [`rideE-${era.id}-f${f}`]: build(enemy, f), [`rideE-${era.id}-b${f}`]: build(mirror(enemy), f),
      });
      for (const k of ['ride', 'rideE']) for (const d of ['f', 'b']) PIXEL[`${k}-${era.id}-${d}${f}`] = 4;
    }
  }
}
makeRiders(ERAS);

// Things in the way on vehicle stages
ART.rock = ['...5555...', '..556655..', '.55566555.', '5555555555', '5555755555', '.55555555.'];
ART.barrel = ['.DDDDDD.', 'D777777D', 'DDDDDDDD', 'D777777D', 'D777777D', 'DDDDDDDD', 'D777777D', '.DDDDDD.'];

// Side-view scenery per timeline: distant hills (with a landmark) and the ground band the vehicles race on.
// Both are tiles scrolled sideways; drawn in whole columns so they repeat seamlessly.
function makeSides(scene) {
  const make = (key, w, h, draw) => {
    const g = scene.make.graphics({ add: false });
    draw(g, new Phaser.Math.RandomDataGenerator([key]));
    g.generateTexture(key, w, h);
    g.destroy();
  };
  const hills = (g, color, n) => { for (let i = 0; i < n; i++) g.fillStyle(color).fillCircle(i * (512 / n) + 40, 220, 90 + (i % 3) * 25); };
  // Rome: temple columns on the hills, a paved road
  make('hills-rome', 512, 220, g => {
    hills(g, 0x8a5a3a, 5);
    g.fillStyle(0xd8c8a8).fillRect(300, 90, 120, 12).fillTriangle(296, 90, 424, 90, 360, 60);
    for (let x = 306; x < 420; x += 22) g.fillRect(x, 102, 10, 50);
    g.fillRect(296, 150, 128, 10);
  });
  make('ground-rome', 256, 470, (g, rnd) => {
    g.fillStyle(0x7a5a32).fillRect(0, 0, 256, 470);
    g.fillStyle(0xb8b0a0).fillRect(0, 30, 256, 10).fillRect(0, 430, 256, 10);
    g.fillStyle(0x5f5a51).fillRect(0, 40, 256, 390);
    for (let y = 40; y < 430; y += 39) {
      for (let x = -rnd.between(0, 40); x < 256;) {
        const w = rnd.between(40, 80), x0 = Math.max(x, 0), x1 = Math.min(x + w, 256);
        if (x1 - x0 > 8) g.fillStyle(rnd.pick([0x8d877b, 0x97917f, 0x847e72])).fillRect(x0 + 2, y + 2, x1 - x0 - 4, 35);
        x += w;
      }
    }
  });
  // England: a castle on green hills, a muddy track with ruts
  make('hills-england', 512, 220, g => {
    hills(g, 0x3f6a35, 5);
    g.fillStyle(0x7d7d8c).fillRect(80, 80, 120, 80).fillRect(70, 50, 30, 110).fillRect(180, 50, 30, 110);
    for (let x = 70; x < 210; x += 14) g.fillRect(x, 40, 8, 12);
    g.fillStyle(0x2a2a3a).fillRect(126, 120, 28, 40);
  });
  make('ground-england', 256, 470, (g, rnd) => {
    g.fillStyle(0x2f5a2a).fillRect(0, 0, 256, 470);
    g.fillStyle(0x6b4a2a).fillRect(0, 40, 256, 390);
    g.fillStyle(0x57391f).fillRect(0, 150, 256, 14).fillRect(0, 300, 256, 14);
    for (let i = 0; i < 50; i++) g.fillStyle(0x8a6a4a).fillRect(rnd.between(0, 250), rnd.between(46, 420), 5, 4);
    for (let i = 0; i < 40; i++) g.fillStyle(0x3f7a35).fillRect(rnd.between(0, 250), rnd.pick([rnd.between(4, 34), rnd.between(436, 464)]), 6, 3);
  });
  // The Caribbean: palm islands on the horizon, open sea
  make('hills-caribbean', 512, 220, g => {
    g.fillStyle(0xe8d08a).fillEllipse(130, 215, 220, 50).fillEllipse(400, 218, 160, 40);
    for (const [x, y] of [[110, 195], [160, 192], [400, 200]]) {
      g.fillStyle(0x6b3e1f).fillRect(x, y - 60, 6, 60);
      g.fillStyle(0x2e8b3a).fillTriangle(x + 3, y - 62, x - 30, y - 45, x - 10, y - 70).fillTriangle(x + 3, y - 62, x + 36, y - 45, x + 16, y - 70);
    }
  });
  make('ground-caribbean', 256, 470, (g, rnd) => {
    g.fillStyle(0x0d4a6e).fillRect(0, 0, 256, 470);
    for (let i = 0; i < 70; i++) g.fillStyle(rnd.pick([0x2f7fa8, 0x1b5f86])).fillRect(rnd.between(0, 230), rnd.between(0, 465), rnd.between(12, 26), 3);
  });
}

// ---------- Roads: one top-down tile per timeline, scrolled under Vega. ----------
// Everything is drawn in whole rows inside the 256px tile, so it repeats seamlessly.
function makeRoads(scene) {
  const TILE = 256, L = 120, R = 480; // the road runs from x=120 to x=480
  const make = (key, draw) => {
    const g = scene.make.graphics({ add: false });
    draw(g, new Phaser.Math.RandomDataGenerator([key])); // seeded, so the same road every time
    g.generateTexture(key, W, TILE);
    g.destroy();
  };
  make('road-1986', g => { // city street: sidewalks, asphalt, white edge lines, yellow center dashes
    g.fillStyle(0x55555f).fillRect(0, 0, W, TILE);
    for (let y = 0; y < TILE; y += 64) g.fillStyle(0x45454f).fillRect(0, y, L - 8, 3).fillRect(R + 8, y, W - R - 8, 3);
    g.fillStyle(0x2a2a33).fillRect(L - 8, 0, R - L + 16, TILE);
    g.fillStyle(0xffffff).fillRect(L + 4, 0, 4, TILE).fillRect(R - 8, 0, 4, TILE);
    for (let y = 0; y < TILE; y += 64) g.fillStyle(0xffd23b).fillRect(W / 2 - 3, y, 6, 40);
  });
  make('road-rome', (g, rnd) => { // paved Roman road with curb stones through dry ground
    g.fillStyle(0x7a5a32).fillRect(0, 0, W, TILE);
    for (let i = 0; i < 60; i++) g.fillStyle(rnd.pick([0x6a4c28, 0x8a6a3e])).fillRect(rnd.between(0, W - 4), rnd.between(0, TILE - 4), 4, 4);
    g.fillStyle(0xb8b0a0).fillRect(L - 10, 0, 10, TILE).fillRect(R, 0, 10, TILE);
    g.fillStyle(0x5f5a51).fillRect(L, 0, R - L, TILE); // mortar between the stones
    for (let y = 0; y < TILE; y += 32) {
      for (let x = L - rnd.between(0, 30); x < R;) {
        const w = rnd.between(36, 70), x0 = Math.max(x, L), x1 = Math.min(x + w, R);
        if (x1 - x0 > 8) g.fillStyle(rnd.pick([0x8d877b, 0x97917f, 0x847e72])).fillRect(x0 + 2, y + 2, x1 - x0 - 4, 28);
        x += w;
      }
    }
  });
  make('road-england', (g, rnd) => { // muddy cart track with wheel ruts through grass
    g.fillStyle(0x2f5a2a).fillRect(0, 0, W, TILE);
    for (let i = 0; i < 90; i++) g.fillStyle(rnd.pick([0x3f7a35, 0x264a22])).fillRect(rnd.between(0, W - 6), rnd.between(0, TILE - 4), 6, 3);
    g.fillStyle(0x6b4a2a).fillRect(L, 0, R - L, TILE);
    for (let y = 0; y < TILE; y += 16) g.fillRect(L - rnd.between(0, 10), y, 10, 16).fillRect(R + rnd.between(0, 10) - 10, y, 10, 16);
    g.fillStyle(0x57391f).fillRect(L + 90, 0, 14, TILE).fillRect(R - 104, 0, 14, TILE);
    for (let i = 0; i < 40; i++) g.fillStyle(0x8a6a4a).fillRect(rnd.between(L + 6, R - 10), rnd.between(0, TILE - 4), 4, 4);
  });
  make('road-caribbean', (g, rnd) => { // wooden pier over the sea
    g.fillStyle(0x0d4a6e).fillRect(0, 0, W, TILE);
    for (let i = 0; i < 40; i++) g.fillStyle(0x2f7fa8).fillRect(rnd.between(0, W - 24), rnd.between(0, TILE - 3), rnd.between(10, 24), 3);
    for (let y = 0; y < TILE; y += 32) {
      g.fillStyle(0x3b2614).fillRect(L, y, R - L, 32);
      g.fillStyle(rnd.pick([0x8a5a2b, 0x7d5126, 0x936233])).fillRect(L, y + 2, R - L, 28);
      g.fillStyle(0x3b2614).fillRect(L + 12, y + 14, 4, 4).fillRect(R - 16, y + 14, 4, 4); // nails
    }
    for (let y = 0; y < TILE; y += 128) g.fillStyle(0x4a2f17).fillRect(L - 14, y + 40, 14, 20).fillRect(R, y + 40, 14, 20); // posts
  });
}
