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
// The four later timelines: armies, shots, mid-bosses and bosses.
Object.assign(ART, {
  outlaw: ['....7777....', '...777777...', '.7777777777.', '...888888...', '...808808...', '...222222...',
           '..D4DDDD4D..', '.8DDDDDDDD8.', '.8D9DDDD9D8.', '..99999999..', '...9....9...', '...7....7...'],
  ninja: ['....9999....', '...999999...', '..99999999..', '..99808099..', '..99999999..', '...999999...',
          '..99999999..', '.9999EE9999.', '.9999999999.', '..99999999..', '...99..99...', '...99..99...'],
  viking: ['.1........1.', '.11.6666.11.', '..16666661..', '...666666...', '...808808...', '..DDD88DDD..',
           '..DDDDDDDD..', '.77DDDDDD77.', '.7777777777.', '..77777777..', '...55..55...', '...77..77...'],
  caveman: ['..77777777..', '.7777777777.', '.7788888877.', '..80888808..', '..88888888..', '..87777778..',
            '.8DDDDDDDD8.', '.8DD7DD7DD8.', '..DDDDDDDD..', '..D7DDDD7D..', '...88..88...', '...88..88...'],
  bullet: ['.4.', '444', '444', '.6.'],
  shuriken: ['..6..', '.666.', '66066', '.666.', '..6..'],
  axe: ['..7..', '..7..', '..7..', '66666', '.666.'],
  stone: ['.555.', '55755', '55555', '57555', '.555.'],
  gatling: ['.......555555.......', '......55000055......', '......50500505......', '......55000055......',
            '.......555555.......', '........5555........', '..DDDDDDDDDDDDDDDD..', '..D77777777777777D..',
            '..D77777777777777D..', '..DDDDDDDDDDDDDDDD..', '777..............777', '7.7..............7.7',
            '777..............777'],
  rattler: ['.......000000.......', '......00000000......', '......00000000......', '......04444440......',
            '00000000000000000000', '....888888888888....', '....880088880088....', '....888888888888....',
            '....888887788888....', '....877777777778....', '....888800008888....', '.....8888888888.....',
            '...22222222222222...', '..9999999999999999..', '.999999999999999999.'],
  oni: ['..1..............1..', '..11............11..', '...11222222222211...', '....222222222222....',
        '...22222222222222...', '...22444222244422...', '...22404222240422...', '...22222222222222...',
        '...22222277222222...', '...22000000000022...', '...22010101010122...', '....222222222222....',
        '.....2222222222.....'],
  shogun: ['..4..............4..', '...4............4...', '....4..........4....', '.....4444444444.....',
           '....999999999999....', '..9999999999999999..', '.999999999999999999.', '....EEEEEEEEEEEE....',
           '....EE00EEEE00EE....', '....EEEEEEEEEEEE....', '....EE11111111EE....', '.....EEEEEEEEEE.....',
           '..E9E9E9E9E9E9E9E9..', '.999999999999999999.'],
  berserker: ['....DDDDDDDDDDDD....', '..DDDDDDDDDDDDDDDD..', '.DDD888888888888DDD.', '.DD88888888888888DD.',
              '.DD83300888800338DD.', '.DD88888888888888DD.', '.DD88888877888888DD.', '.DDDDDDDDDDDDDDDDDD.',
              '..DDDDD000000DDDDD..', '...DDDDDDDDDDDDDD...', '....DD.DDDDDD.DD....', '....DD..DDDD..DD....',
              '....44...44...44....'],
  frostgiant: ['...1...1....1...1...', '...11.111..111.11...', '..1111111111111111..', '..3333333333333333..',
               '.333333333333333333.', '.333110033331100333.', '.333333333333333333.', '.333333336633333333.',
               '.311111111111111113.', '..1111100000011111..', '..1111111111111111..', '...11111111111111...',
               '....111111111111....', '.....1111111111.....', '.......111111.......'],
  mammoth: ['....DDDDDDDDDDDD....', '..DDDDDDDDDDDDDDDD..', '.DDDDDDDDDDDDDDDDDD.', 'DDDDD00DDDDDD00DDDDD',
            'DDDDDDDDDDDDDDDDDDDD', 'DDDDDDDDDDDDDDDDDDDD', '1.DDDDDDDDDDDDDDDD.1', '.1..DDDDDDDDDDDD..1.',
            '..1....DDDDDD....1..', '...11...DDDD...11...', '........DDDD........', '.........DDD........',
            '..........DD........'],
  trex: ['.....CCCCCCCCCC.....', '...CCCCCCCCCCCCCC...', '..CCCCCCCCCCCCCCCC..', '..CC44CCCCCCCC44CC..',
         '..CC40CCCCCCCC40CC..', '..CCCCCCCCCCCCCCCC..', '..CCC0CCCCCCCC0CCC..', '..CCCCCCCCCCCCCCCC..',
         '..C00000000000000C..', '..C01010101010101C..', '..C00000000000000C..', '..C10101010101010C..',
         '..CCCCCCCCCCCCCCCC..', '...CCCCCCCCCCCCCC...'],
  // Vehicle-stage obstacles, the Stampede's cattle, and the Bone Boomerang
  cactus: ['...CC...', '...CC...', '.C.CC...', '.C.CC.C.', '.CCCC.C.', '...CCCC.', '...CC...', '...CC...', '...CC...', '...CC...'],
  iceberg: ['...1111...', '..111111..', '.11BB1111.', '1111111B11', '1B11111111', '.11111111.'],
  bull: ['1........1', '11......11', '.17777771.', '..777777..', '..707707..', '..777777..', '...7777...', '...7887...', '....88....'],
  boomerang: ['1.....1', '11...11', '.11.11.', '..111..'],
});

// The rest of each army (see ROLES): sharpshooter and charger 12x12, heavy 14x14, all front view.
Object.assign(ART, {
  // Rome: archer, gladiator, praetorian with a tower shield
  sagittarius: ['....7777....', '...777777...', '...788887...', '...808808...', '....8888....', '.7..2222....',
                '7.1222222...', '7.1822228...', '7.1222222...', '.7..4444....', '....7..7....', '....7..7....'],
  gladiator: ['....5555....', '...566665...', '...500005...', '...566665...', '....8888....', '..88888888..',
              '.8.888888.6.', '.8.888888.6.', '...EEEEEE.6.', '...E7777E.5.', '...8....8...', '...7....7...'],
  praetorian: ['......22......', '.....2222.....', '....444444....', '...44888844...', '....480084....', '.....8888.....',
               '.EEEEEEEEEEEE.', '.E2222222222E.', '.E2224444222E.', '.E2224114222E.', '.E2224444222E.', '.E2222222222E.',
               '.EEEEEEEEEEEE.', '...77....77...'],
  // England: longbowman, pikeman, mace knight
  longbowman: ['....CCCC....', '...CCCCCC...', '..CC8888CC..', '...808808...', '....8888....', '.7..CCCC....',
               '7.1CCCCCC...', '7.18C77C8...', '7.1CCCCCC...', '.7..CCCC....', '....7..7....', '....7..7....'],
  pikeman: ['..........6.', '...5555..666', '..55555555..', '...888888.7.', '...808808.7.', '....8888..7.',
            '..33333338..', '.833311333..', '..33333337..', '..33111337..', '...5...5.7..', '...5...5....'],
  maceknight: ['.....6666.....', '....666666....', '....600006....', '....666666....', '.....6666.....', '..6666666666..',
               '.663333333366.', '.663311113366.', '.663333333366.', '.6.33311333.65', '.5.33333333.55', '...66666666.7.',
               '...66....66...', '...55....55...'],
  // The Caribbean: musketeer, swashbuckler, powder-keg brute
  musketeer: ['..99999999..', '.9999999999.', '...888888...', '...808808...', '...887788...', '..GGGGGGGG..',
              '.8GG4GG4GG8.', '..7GGGGGG...', '...7GGGG....', '..GG7GGGG...', '...9.7..9...', '...9..7.9...'],
  swashbuckler: ['...HHHHHH...', '..HHHHHHHH.6', '..88888888.6', '..80088808.6', '..88888888.6', '...877778.8.',
                 '..11111118..', '.8111111111.', '..1111111...', '..9999999...', '...9....9...', '...7....7...'],
  powderbrute: ['....888888....', '...88888888...', '...80088008...', '...88888888...', '...88877888...', '.....8888.....',
                '.DDDD2222DDDD.', 'D777D2222D777D', 'DDDDD2222DDDDD', 'D777D2222D777D', '.DDDD2222DDDD.', '....999999....',
                '....99..99....', '....77..77....'],
  // The Wild West: rifleman, bandito, bruiser
  rifleman: ['....DDDD....', '.DDDDDDDDDD.', '...888888...', '...808808...', '...899998...', '..55555555.6',
             '.8555555558.', '.85555555577', '..7777777..7', '..9999999..7', '...9....9...', '...7....7...'],
  bandito: ['.....44.....', '....4444....', '.4444444444.', '...888888...', '...808808...', '...877778...',
            '..2C4C2C4C..', '.82C4C2C4C8.', '..2C4C2C4C.6', '...999999..6', '...9....9...', '...7....7...'],
  bruiser: ['....000000....', '...00000000...', '.000000000000.', '...88888888...', '...80888808...', '...88777788...',
            '..7DDDDDDDD7..', '.88DDDDDDDD88.', '.88D9DDDD9D88.', '.5.DDDDDDDD.5.', '.5.99999999.5.', '...99....99...',
            '...99....99...', '...77....77...'],
  // Feudal Japan: yumi archer, ashigaru spearman, armoured samurai
  yumi: ['....7777....', '..77777777..', '7..888888...', '71.808808...', '71..8888....', '71.EEEEEE...',
         '718EEEEEE8..', '71.EEEEEE...', '71.999999...', '7..999999...', '...9....9...', '...7....7...'],
  ashigaru: ['.....99....6', '...999999..6', '.9999449999.', '...888888.7.', '...808808.7.', '....8888..7.',
             '..EEEEEEE87.', '.8EE9EE9EE7.', '..EEEEEEE.7.', '..9999999.7.', '...9...9..7.', '...7...7....'],
  samurai: ['..4........4..', '...4......4...', '....999999....', '...99999999...', '...EEEEEEEE...', '...E808808E...',
            '....888888....', '.EEEEEEEEEEEE.', 'E9E9EEEEEE9E9E', 'E9E9E4444E9E9E', '.EEEEEEEEEEEE6', '...99999999.6.',
            '...99....99...', '...00....00...'],
  // Scandinavia: spear thrower, raider, huscarl with a round shield
  spearthrower: ['..........6.', '...7777..666', '..777777..7.', '..788887..7.', '..808808..7.', '...8DD8...7.',
                 '..DDDDDD.87.', '.8DDDDDD..7.', '..DDDDDD....', '..777777....', '...5...5....', '...7...7....'],
  raider: ['...444444...', '..44444444..', '..48888884..', '..48088084..', '..44444444..', '...444444...',
           '..88888888.5', '.8.777777.55', '.8.777777.7.', '...777777...', '...7....7...', '...7....7...'],
  huscarl: ['.....6666.....', '....666666....', '....660066....', '....686686....', '.....8888.....', '..DDDDD.......',
            '.DD77DDD555...', '.D7DD7DD5555..', '.D7D447D5555..', '.D7DD7DD5555..', '.DD77DDD555...', '..DDDDD5555...',
            '.....55..55...', '.....77..77...'],
  // The Stone Age: slinger, sabre-tooth cat, club brute
  slinger: ['.5..........', '..7.0000....', '...000000...', '..00888800..', '...808808...', '...888888...',
            '..8DDDDDD...', '.8.DDDDDD8..', '...DD7DDD...', '...DDDDDD...', '....8..8....', '....8..8....'],
  sabretooth: ['..D......D..', '..DD....DD..', '..DDDDDDDD..', '.DDDDDDDDDD.', '.DD00DD00DD.', '.DDDDDDDDDD.',
               '..DDD00DDD..', '..D1DDDD1D..', '..D1.DD.1D..', '...1....1...', '..DD....DD..', '..DD....DD..'],
  clubbrute: ['.........777..', '..000000.7777.', '.00000000.777.', '.008888800.7..', '..80888808.7..', '..88888888.7..',
              '..88877888.7..', '.DDDDDDDDDD7..', '8DDDDDDDDDD8..', '8DD7DDDD7DD8..', '.DDDDDDDDDD...', '..DDDDDDDD....',
              '...88..88.....', '...88..88.....'],
});

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
  gatling: 6, rattler: 6, oni: 6, shogun: 6, berserker: 6, frostgiant: 6, mammoth: 6, trex: 6,
  spear: 3, arrow: 3, cannonball: 3, ink: 3, orb: 3, laser: 3, arrowUp: 3, coin: 3, spark: 2, streak: 2,
  bullet: 3, shuriken: 3, axe: 3, stone: 3,
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
const RAPTOR_TOP = ['..............CCC...', '.............CCCCC..', '.............CC0CCC.', '.............CCCCCCC', '............CCC.1.1.',
  'C..........CCC......', '.CC.....CCCCC.......', '..CCCCCCCCCCC.......', '....CCCCCCCC........'];
const RAPTOR = [ // a running raptor for the Stone Age: legs apart, then together
  [...RAPTOR_TOP, '.....CC..CC.........', '....CC....CC........', '...00......00.......'],
  [...RAPTOR_TOP, '......CCCC..........', '......C..C..........', '.....00..00.........'],
];
// Each vehicle: a function turning (rider, frame) into one composed sprite.
const VEHICLES = {
  horse: (rider, f) => compose(20, 20, [[HORSE[f], 0, 7], [rider, 6, 3]]),
  chariot: (rider, f) => compose(28, 20, [[HORSE[f], 8, 7], [rider, 1, 3], [CART, 0, 10], [WHEEL[f], 2, 13]]),
  boat: (rider, f) => compose(24, 15, [[rider, 8, 0], [[...HULL, WAKE[f]], 0, 8]]),
  raptor: (rider, f) => compose(20, 19, [[RAPTOR[f], 0, 7], [rider, 6, 4]]),
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
    if (scene.textures.exists(key)) return; // already made, or replaced by your own image
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
  // The Wild West: flat-topped mesas and a cactus, a dusty trail
  make('hills-west', 512, 220, g => {
    g.fillStyle(0xa0522d).fillRect(40, 110, 150, 110).fillTriangle(10, 220, 40, 110, 40, 220).fillTriangle(190, 110, 220, 220, 190, 220);
    g.fillRect(300, 140, 110, 80).fillTriangle(280, 220, 300, 140, 300, 220).fillTriangle(410, 140, 430, 220, 410, 220);
    g.fillStyle(0x3f6a35).fillRect(470, 150, 10, 70).fillRect(458, 168, 12, 6).fillRect(458, 156, 6, 14);
  });
  make('ground-west', 256, 470, (g, rnd) => {
    g.fillStyle(0xc8a064).fillRect(0, 0, 256, 470);
    g.fillStyle(0xa87c48).fillRect(0, 40, 256, 390);
    g.fillStyle(0x8a6234).fillRect(0, 150, 256, 12).fillRect(0, 300, 256, 12);
    for (let i = 0; i < 50; i++) g.fillStyle(rnd.pick([0xb08a50, 0xd8b478])).fillRect(rnd.between(0, 250), rnd.between(0, 465), 5, 3);
  });
  // Feudal Japan: a pagoda and blossom trees on dark hills, a stone path
  make('hills-japan', 512, 220, g => {
    hills(g, 0x4a3a5a, 5);
    g.fillStyle(0x2a2030);
    for (let i = 0; i < 4; i++) g.fillRect(330 + i * 8, 190 - i * 34, 60 - i * 16, 24).fillTriangle(316 + i * 8, 190 - i * 34, 404 - i * 8, 190 - i * 34, 360, 176 - i * 34);
    g.fillStyle(0xffb7d5).fillCircle(120, 150, 26).fillCircle(150, 140, 22).fillCircle(470, 160, 24);
  });
  make('ground-japan', 256, 470, (g, rnd) => {
    g.fillStyle(0x3a5a3a).fillRect(0, 0, 256, 470);
    g.fillStyle(0x6a6a5e).fillRect(0, 40, 256, 390);
    for (let y = 40; y < 430; y += 65) for (let x = 0; x < 256; x += 64) g.fillStyle(rnd.pick([0x9a9a8a, 0xa4a494, 0x8e8e7e])).fillRect(x + 3, y + 3, 58, 59);
    for (let i = 0; i < 30; i++) g.fillStyle(0xffb7d5).fillRect(rnd.between(0, 250), rnd.between(0, 465), 4, 4);
  });
  // Scandinavia: snowy mountains and a longhouse, an icy sea
  make('hills-norse', 512, 220, g => {
    for (const [x, w, h] of [[0, 220, 170], [170, 200, 130], [330, 240, 190]]) {
      g.fillStyle(0x6a7a8a).fillTriangle(x, 220, x + w / 2, 220 - h, x + w, 220);
      g.fillStyle(0xf4f8fb).fillTriangle(x + w / 2 - w / 8, 220 - h * 0.75, x + w / 2, 220 - h, x + w / 2 + w / 8, 220 - h * 0.75);
    }
    g.fillStyle(0x6b3e1f).fillRect(220, 180, 90, 40).fillStyle(0x4a2f17).fillTriangle(212, 182, 318, 182, 265, 150);
  });
  make('ground-norse', 256, 470, (g, rnd) => {
    g.fillStyle(0x2a4a62).fillRect(0, 0, 256, 470);
    for (let i = 0; i < 18; i++) g.fillStyle(rnd.pick([0xcfe0ea, 0xa8c4d4])).fillEllipse(rnd.between(20, 236), rnd.between(10, 460), rnd.between(20, 40), rnd.between(8, 14));
    for (let i = 0; i < 40; i++) g.fillStyle(0x3d6582).fillRect(rnd.between(0, 230), rnd.between(0, 465), rnd.between(12, 24), 3);
  });
  // The Stone Age: a smoking volcano and ferns, a jungle track
  make('hills-stone', 512, 220, g => {
    g.fillStyle(0x5a3a2a).fillTriangle(180, 220, 300, 60, 420, 220);
    g.fillStyle(0xff5a2a).fillTriangle(280, 86, 300, 60, 320, 86);
    g.fillStyle(0x7d7d8c).fillCircle(300, 40, 18).fillCircle(318, 22, 14).fillCircle(336, 10, 10);
    g.fillStyle(0x2e6b2e).fillTriangle(40, 220, 70, 150, 100, 220).fillTriangle(450, 220, 480, 160, 510, 220);
  });
  make('ground-stone', 256, 470, (g, rnd) => {
    g.fillStyle(0x2e6b2e).fillRect(0, 0, 256, 470);
    g.fillStyle(0x8a6a3e).fillRect(0, 40, 256, 390);
    for (let i = 0; i < 50; i++) g.fillStyle(0x6a4c28).fillRect(rnd.between(0, 250), rnd.between(46, 420), 5, 4);
  });
}

// ---------- Roads: one top-down tile per timeline, scrolled under Vega. ----------
// Everything is drawn in whole rows inside the 256px tile, so it repeats seamlessly.
function makeRoads(scene) {
  const TILE = 256, L = 120, R = 480; // the road runs from x=120 to x=480
  const make = (key, draw) => {
    if (scene.textures.exists(key)) return; // already made, or replaced by your own image
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
  make('road-caribbean', (g, rnd) => { // a wide wooden pier over the sea, rope rails along its edges
    // ponytail: its own edges, wider than the other roads, so nobody on it (Vega walks x 35-565) is over the water.
    const pl = 24, pr = W - 24;
    g.fillStyle(0x0d4a6e).fillRect(0, 0, W, TILE);
    for (let i = 0; i < 16; i++) g.fillStyle(0x2f7fa8).fillRect(rnd.pick([rnd.between(0, 10), rnd.between(W - 22, W - 12)]), rnd.between(0, TILE - 3), 10, 3);
    for (let y = 0; y < TILE; y += 32) {
      g.fillStyle(0x3b2614).fillRect(pl, y, pr - pl, 32);
      g.fillStyle(rnd.pick([0x8a5a2b, 0x7d5126, 0x936233])).fillRect(pl, y + 2, pr - pl, 28);
      for (const x of [pl + 14, W / 2 - 2, pr - 18]) g.fillStyle(0x3b2614).fillRect(x, y + 14, 4, 4); // nails
    }
    for (let y = 0; y < TILE; y += 64) g.fillStyle(0x4a2f17).fillRect(pl - 10, y + 24, 16, 16).fillRect(pr - 6, y + 24, 16, 16); // posts
    g.fillStyle(0xd8c49a).fillRect(pl - 3, 0, 4, TILE).fillRect(pr - 1, 0, 4, TILE); // rope rails
  });
  make('road-west', (g, rnd) => { // dusty trail with wagon ruts between cacti
    g.fillStyle(0xc8a064).fillRect(0, 0, W, TILE);
    for (let i = 0; i < 50; i++) g.fillStyle(rnd.pick([0xb08a50, 0xd8b478])).fillRect(rnd.between(0, W - 4), rnd.between(0, TILE - 4), 4, 3);
    g.fillStyle(0xa87c48).fillRect(L, 0, R - L, TILE);
    for (let y = 0; y < TILE; y += 16) g.fillRect(L - rnd.between(0, 10), y, 10, 16).fillRect(R + rnd.between(0, 10) - 10, y, 10, 16);
    g.fillStyle(0x8a6234).fillRect(L + 90, 0, 12, TILE).fillRect(R - 102, 0, 12, TILE);
    for (const [x, y] of [[44, 40], [536, 170]]) { // saguaro cacti
      g.fillStyle(0x3f7a35).fillRect(x, y, 14, 62).fillRect(x - 14, y + 20, 14, 8).fillRect(x - 14, y + 6, 8, 18).fillRect(x + 14, y + 28, 14, 8).fillRect(x + 20, y + 14, 8, 18);
    }
  });
  make('road-japan', (g, rnd) => { // stone-slab temple path through moss and fallen cherry petals, with stone lanterns
    g.fillStyle(0x3a5a3a).fillRect(0, 0, W, TILE);
    for (let i = 0; i < 70; i++) g.fillStyle(rnd.pick([0xffb7d5, 0x2e4a2e, 0xffd6e6])).fillRect(rnd.between(0, W - 4), rnd.between(0, TILE - 4), 4, 4);
    g.fillStyle(0x6a6a5e).fillRect(L, 0, R - L, TILE);
    for (let y = 0; y < TILE; y += 64) for (let x = L; x < R; x += 60) g.fillStyle(rnd.pick([0x9a9a8a, 0xa4a494, 0x8e8e7e])).fillRect(x + 3, y + 3, Math.min(60, R - x) - 6, 58);
    for (let y = 0; y < TILE; y += 128) g.fillStyle(0x8e8e86).fillRect(L - 40, y + 30, 24, 30).fillRect(L - 46, y + 24, 36, 8).fillRect(R + 16, y + 30, 24, 30).fillRect(R + 10, y + 24, 36, 8);
  });
  make('road-norse', (g, rnd) => { // icy track along a snowy coast
    g.fillStyle(0xdde8f0).fillRect(0, 0, W, TILE);
    for (let i = 0; i < 50; i++) g.fillStyle(0xb8c8d8).fillRect(rnd.between(0, W - 6), rnd.between(0, TILE - 4), 6, 3);
    g.fillStyle(0x9fb4c4).fillRect(L, 0, R - L, TILE);
    for (let i = 0; i < 14; i++) { // cracks in the ice
      const x = rnd.between(L + 10, R - 60), y = rnd.between(0, TILE - 20);
      g.fillStyle(0x7f94a4).fillRect(x, y, rnd.between(20, 50), 2).fillRect(x + 10, y, 2, rnd.between(8, 18));
    }
    g.fillStyle(0xf4f8fb).fillRect(L - 12, 0, 12, TILE).fillRect(R, 0, 12, TILE); // snowbanks
  });
  make('road-stone', (g, rnd) => { // dirt track through ferns
    g.fillStyle(0x2e6b2e).fillRect(0, 0, W, TILE);
    for (let i = 0; i < 26; i++) {
      const x = rnd.pick([rnd.between(4, L - 30), rnd.between(R + 4, W - 30)]), y = rnd.between(10, TILE - 30);
      g.fillStyle(rnd.pick([0x3f8a3f, 0x24561f])).fillTriangle(x, y + 24, x + 13, y, x + 26, y + 24);
    }
    g.fillStyle(0x8a6a3e).fillRect(L, 0, R - L, TILE);
    for (let y = 0; y < TILE; y += 16) g.fillRect(L - rnd.between(0, 10), y, 10, 16).fillRect(R + rnd.between(0, 10) - 10, y, 10, 16);
    for (let i = 0; i < 40; i++) g.fillStyle(0x6a4c28).fillRect(rnd.between(L + 6, R - 10), rnd.between(0, TILE - 4), 5, 4);
  });
}
