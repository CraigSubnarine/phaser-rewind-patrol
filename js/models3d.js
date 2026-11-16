// Low-poly 3D models for the 3D view (js/view3d.js), built in code like the pixel art. Characters are chibi: a big
// head, a small body and stubby legs, about 1.1 units tall before `size`, facing +z (towards the camera). Each model
// is a THREE.Group; `userData.legs` (hip pivots) swing while it walks, and `userData.mats` are its materials (each
// model has its own, so a hit can flash one soldier without flashing them all).
// Sprites without a model here are drawn by the view as upright cut-outs of their 2D sprite.
const MODELS3D = (() => {
  if (typeof THREE === 'undefined') return {}; // three.js didn't load: the game stays 2D
  const geos = new Map(), G = (key, make) => geos.get(key) ?? geos.set(key, make()).get(key); // shared shapes
  const sphere = (r, half = false) => G(`s${r}${half}`, () => new THREE.SphereGeometry(r, 14, 10, 0, Math.PI * 2, 0, half ? Math.PI / 2 : Math.PI));
  const capsule = (r, l) => G(`c${r},${l}`, () => new THREE.CapsuleGeometry(r, l, 4, 10));
  const box = (w, h, d) => G(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
  const cyl = (rt, rb, h, n = 14) => G(`y${rt},${rb},${h},${n}`, () => new THREE.CylinderGeometry(rt, rb, h, n));
  const cone = (r, h) => G(`k${r},${h}`, () => new THREE.ConeGeometry(r, h, 8));
  const torus = (R, t, arc = Math.PI * 2) => G(`t${R},${t},${arc}`, () => new THREE.TorusGeometry(R, t, 6, 18, arc));

  // Each part gets its own material, listed in the group's userData.mats.
  function part(g, geometry, color, x, y, z, root = g) {
    const m = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color, transparent: true }));
    m.position.set(x, y, z);
    g.add(m);
    (root.userData.mats ??= []).push(m.material);
    return m;
  }

  // A chibi character. o: body, arms, legs, boots, skin, belt, skirt, cape, emblem, hat { style, color, crest, ... },
  // weapon ('spear' | 'sword' | 'bow' | 'pistol'), shield { style: 'scutum' | 'tower' | 'round', color, trim }, size.
  function chibi(o) {
    const g = new THREE.Group(), legs = [];
    for (const s of [-1, 1]) { // legs on hip pivots, so they can swing
      const hip = new THREE.Group();
      hip.position.set(s * 0.1, 0.3, 0);
      g.add(hip);
      part(hip, capsule(0.075, 0.13), o.legs ?? 0x4a3a2a, 0, -0.14, 0, g);
      part(hip, box(0.13, 0.07, 0.18), o.boots ?? 0x2a1e14, 0, -0.27, 0.03, g);
      legs.push(hip);
    }
    part(g, capsule(0.17, 0.14), o.body, 0, 0.48, 0).scale.z = 0.8;
    if (o.skirt) part(g, cyl(0.16, 0.22, 0.14), o.skirt, 0, 0.33, 0);
    if (o.belt) part(g, cyl(0.172, 0.172, 0.05), o.belt, 0, 0.38, 0);
    if (o.emblem) part(g, box(0.12, 0.1, 0.02), o.emblem, 0, 0.52, 0.14);
    for (const s of [-1, 1]) part(g, capsule(0.055, 0.13), o.arms ?? o.body, s * 0.22, 0.48, 0.02).rotation.z = s * 0.25;
    if (o.cape) part(g, box(0.42, 0.5, 0.03), o.cape, 0, 0.46, -0.17);
    part(g, sphere(0.25), o.skin ?? 0xf0b98a, 0, 0.86, 0); // head
    for (const s of [-1, 1]) part(g, sphere(0.035), 0x111111, s * 0.08, 0.86, 0.235); // eyes
    hat(g, o.hat ?? {});
    weapon(g, o.weapon);
    if (o.shield) shield(g, o.shield);
    g.userData.legs = legs;
    g.scale.setScalar(o.size ?? 0.5);
    return g;
  }

  function hat(g, h) {
    const c = h.color;
    if (h.style === 'helmet') { // a Roman-style helmet with a crest from front to back
      part(g, sphere(0.27, true), c, 0, 0.9, 0);
      part(g, box(0.5, 0.04, 0.5), c, 0, 0.88, -0.02).scale.set(1, 1, 0.9);
      if (h.crest) part(g, box(0.06, h.tall ? 0.24 : 0.14, 0.38), h.crest, 0, h.tall ? 1.24 : 1.18, -0.02);
    } else if (h.style === 'gladiator') { // a closed helmet with a grille
      part(g, sphere(0.275), c, 0, 0.88, 0);
      part(g, box(0.24, 0.12, 0.04), 0x2a2a33, 0, 0.86, 0.26);
      part(g, box(0.04, 0.22, 0.3), c, 0, 1.12, 0);
    } else if (h.style === 'hair') {
      part(g, sphere(0.265, true), c, 0, 0.88, -0.02);
    } else if (h.style === 'cap') { // police cap: crown, peak, badge
      part(g, cyl(0.25, 0.27, 0.13), c, 0, 1.06, 0);
      part(g, box(0.3, 0.03, 0.14), 0x111111, 0, 1.0, 0.2);
      if (h.badge) part(g, box(0.08, 0.06, 0.02), h.badge, 0, 1.07, 0.27);
    } else if (h.style === 'fedora') {
      part(g, cyl(0.38, 0.38, 0.03, 18), c, 0, 1.02, 0);
      part(g, cyl(0.2, 0.24, 0.18), c, 0, 1.12, 0);
    }
  }

  function weapon(g, w) {
    if (w === 'spear') {
      part(g, cyl(0.016, 0.016, 0.95, 6), 0x7b5a3a, 0.3, 0.55, 0.06);
      part(g, cone(0.04, 0.12), 0xd0d0dc, 0.3, 1.08, 0.06);
    } else if (w === 'sword') {
      part(g, box(0.05, 0.42, 0.02), 0xd0d0dc, 0.3, 0.62, 0.12);
      part(g, box(0.14, 0.03, 0.04), 0xd8b04a, 0.3, 0.41, 0.12);
    } else if (w === 'bow') {
      part(g, torus(0.24, 0.016, Math.PI), 0x7b5a3a, -0.27, 0.5, 0.08).rotation.z = Math.PI / 2;
      part(g, cyl(0.004, 0.004, 0.48, 4), 0xeeeeee, -0.27, 0.5, 0.08);
    } else if (w === 'pistol') { // held out front in both hands
      part(g, box(0.07, 0.08, 0.24), 0x55555f, 0, 0.5, 0.26);
      part(g, sphere(0.06), 0xf0b98a, 0, 0.48, 0.17);
    }
  }

  function shield(g, s) {
    if (s.style === 'round') {
      part(g, cyl(0.17, 0.17, 0.04, 16), s.color, -0.26, 0.46, 0.14).rotation.x = Math.PI / 2;
      part(g, sphere(0.05), s.trim, -0.26, 0.46, 0.17);
    } else { // a Roman scutum, or a big tower shield
      const big = s.style === 'tower', w = big ? 0.42 : 0.3, h = big ? 0.6 : 0.42;
      part(g, box(w, h, 0.05), s.color, -0.2, 0.46, 0.24);
      part(g, box(w + 0.02, 0.04, 0.06), s.trim, -0.2, 0.46 + h / 2, 0.24);
      part(g, box(w + 0.02, 0.04, 0.06), s.trim, -0.2, 0.46 - h / 2, 0.24);
      part(g, sphere(0.05), s.trim, -0.2, 0.46, 0.27);
    }
  }

  function drone() {
    const g = new THREE.Group();
    part(g, box(0.34, 0.1, 0.34), 0xc8c8d4, 0, 0, 0);
    part(g, sphere(0.06), 0x4ff0ff, 0, -0.05, 0.12);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) part(g, cyl(0.1, 0.1, 0.02), 0x4ff0ff, x * 0.22, 0.06, z * 0.22);
    g.userData.hover = 0.75; // floats above the road
    return g;
  }

  // Pickups float a little above the road and spin (userData.spin).
  function pickup(build) {
    const g = new THREE.Group();
    build(g);
    Object.assign(g.userData, { spin: 3, hover: 0.18 });
    return g;
  }

  const GOLD = 0xd8b04a, RED = 0xc23b3b, DARK_RED = 0x8a1c1c, IRON = 0x8a8a96;
  return {
    // Officer Vega and his Backup Partner (seen from behind: the view turns them to face up the road)
    vega: () => chibi({ body: 0x3a56d4, legs: 0x23234a, belt: 0x1b1b2f, hat: { style: 'cap', color: 0x1b1b2f, badge: 0xffd23b }, weapon: 'pistol', size: 0.62 }),
    partner: () => chibi({ body: 0x7a4a22, legs: 0x3a3a48, hat: { style: 'fedora', color: 0x5a3a1a }, weapon: 'pistol', size: 0.55 }),
    drone,
    // Rome's army: legionary (grunt), archer (sharpshooter), praetorian with a tower shield (heavy), gladiator (charger)
    legionary: () => chibi({ body: RED, skirt: DARK_RED, belt: GOLD, hat: { style: 'helmet', color: GOLD, crest: 0xff3b3b }, weapon: 'spear', shield: { style: 'scutum', color: RED, trim: GOLD }, size: 0.58 }),
    sagittarius: () => chibi({ body: RED, skirt: 0x7a2a2a, hat: { style: 'hair', color: 0x6b3e1f }, weapon: 'bow', size: 0.55 }),
    praetorian: () => chibi({ body: DARK_RED, skirt: 0x5a1010, belt: GOLD, hat: { style: 'helmet', color: GOLD, crest: 0xff3b3b }, weapon: 'spear', shield: { style: 'tower', color: DARK_RED, trim: GOLD }, size: 0.78 }),
    gladiator: () => chibi({ body: 0xf0b98a, belt: DARK_RED, skirt: DARK_RED, hat: { style: 'gladiator', color: IRON }, weapon: 'sword', shield: { style: 'round', color: 0x7d5a2a, trim: IRON }, size: 0.55 }),
    // Rome's bosses
    champion: () => chibi({ body: 0xf0b98a, belt: GOLD, skirt: DARK_RED, hat: { style: 'helmet', color: GOLD, crest: 0xffd23b }, weapon: 'spear', shield: { style: 'round', color: GOLD, trim: 0x8a6a2a }, size: 1.7 }),
    centurion: () => chibi({ body: IRON, skirt: RED, belt: GOLD, emblem: 0xffd23b, cape: 0xb02828, hat: { style: 'helmet', color: IRON, crest: 0xff3b3b, tall: true }, weapon: 'sword', size: 2 }),
    // Pickups
    coin: () => pickup(g => { part(g, cyl(0.13, 0.13, 0.035, 18), 0xffd23b, 0, 0, 0).rotation.x = Math.PI / 2; }),
    donut: () => pickup(g => { part(g, torus(0.11, 0.055), 0xff4fd8, 0, 0, 0); }),
    coffee: () => pickup(g => { part(g, cyl(0.1, 0.08, 0.2), 0xffffff, 0, 0, 0); part(g, cyl(0.09, 0.09, 0.02), 0x5a3a1a, 0, 0.1, 0); }),
    part: () => pickup(g => { part(g, G('oct', () => new THREE.OctahedronGeometry(0.17)), 0x4ff0ff, 0, 0.05, 0); }),
  };
})();
