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
