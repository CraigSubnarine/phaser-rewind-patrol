// The 3D view (Settings: Graphics, 3D is the default). Phaser keeps running the game exactly as in 2D (waves,
// physics, bosses, shop, all of it); this draws the same world with three.js from a chase camera behind Vega, every
// frame, and Phaser stops drawing. The ground plane is the 2D screen laid flat: game x runs across the road, game y
// along it (1 unit = 100 game pixels). Characters, shots and pickups are their own 2D sprites standing up in the 3D
// world (Craig's pick: the 3D angle with the 2D characters). Text (HUD, banners, taunts, toasts) is HTML on top.
// Bonus chases are still drawn in 2D.
const view3d = (() => {
  const U = 0.01, at = (x, y, h = 0) => new THREE.Vector3((x - W / 2) * U, h, (y - H) * U);
  // The camera frames the play area exactly: the line where enemies appear (60 px above the 2D screen) at the top
  // edge, the bottom of the 2D screen at the bottom edge, seen from behind at a 50 degree tilt.
  const PITCH = 50 * Math.PI / 180, FOV = 50, zFar = -(H + 60) * U, zNear = 0;
  const lo = PITCH - FOV / 2 * Math.PI / 180, hi = PITCH + FOV / 2 * Math.PI / 180;
  const CAM_H = (zNear - zFar) / (1 / Math.tan(lo) - 1 / Math.tan(hi)), CAM_Z = zNear + CAM_H / Math.tan(hi), LOOK_Z = CAM_Z - CAM_H / Math.tan(PITCH);
  const things = new Map(); // Phaser object -> its 3D stand-in
  const labels = new Map(); // Phaser text, or an enemy's health bar -> its HTML element
  const textures = new Map(); // texture key (+ variant) -> THREE.Texture
  let r = null, active = false, idle = 0;

  function setup() {
    const canvas = Object.assign(document.createElement('canvas'), { id: 'view3d' });
    const overlay = Object.assign(document.createElement('div'), { id: 'overlay3d' });
    overlay.innerHTML = '<div id="bossbar3d"><i></i></div>';
    document.body.append(canvas, overlay);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(FOV, W / H, 0.1, 80);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x665577, 1.1));
    // The road (the timeline's road tile, repeating into the distance) on plain ground of the tile's edge colour.
    const road = new THREE.Mesh(new THREE.PlaneGeometry(W * U, 44), new THREE.MeshLambertMaterial({ transparent: true }));
    road.rotation.x = -Math.PI / 2;
    road.position.z = -18; // from z = 4 (behind the camera) to z = -40
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshLambertMaterial());
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.02, -30);
    scene.add(road, ground);
    // Sparks: one point cloud fed from Phaser's particle emitter.
    const MAXP = 800, pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXP * 3), 3));
    pgeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAXP * 3), 3));
    const sparks = new THREE.Points(pgeo, new THREE.PointsMaterial({ size: 0.09, vertexColors: true }));
    scene.add(sparks);
    // Rings round Vega's feet: shield (cyan), Testudo (gold), Nitro (orange).
    const rings = [[0x4ff0ff, 0.42], [0xffd23b, 0.5], [0xff8a2a, 0.58]].map(([color, rad]) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(rad, 0.025, 6, 32), new THREE.MeshBasicMaterial({ color }));
      m.rotation.x = -Math.PI / 2;
      scene.add(m);
      return m;
    });
    const shadow = { geo: new THREE.CircleGeometry(1, 20), mat: new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.28, depthWrite: false }) };
    r = { canvas, overlay, renderer, scene, camera, road, ground, sparks, MAXP, rings, shadow, roadKey: null };
  }

  // A Phaser texture as a three.js one, made once. `road`: repeating along its length. `white`: the sprite's shape in
  // white, for the flash when something is hit.
  function tex(key, variant = '') {
    const id = `${key}|${variant}`;
    if (!textures.has(id)) {
      let src = game.textures.get(key).getSourceImage();
      if (variant === 'white') {
        const c = Object.assign(document.createElement('canvas'), { width: src.width, height: src.height }), ctx = c.getContext('2d');
        ctx.drawImage(src, 0, 0);
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        src = c;
      }
      const t = new THREE.Texture(src);
      t.magFilter = THREE.NearestFilter;
      if (variant === 'road') {
        t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(1, 44 / 2.56);
        t.anisotropy = r.renderer.capabilities.getMaxAnisotropy();
      }
      t.needsUpdate = true;
      textures.set(id, t);
    }
    return textures.get(id);
  }
  function edgeColour(key) { // the colour at a road tile's left edge, for the ground either side
    const c = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }), ctx = c.getContext('2d');
    ctx.drawImage(game.textures.get(key).getSourceImage(), 2, 100, 1, 1, 0, 0, 1, 1);
    const [red, green, blue] = ctx.getImageData(0, 0, 1, 1).data;
    return (red << 16) | (green << 8) | blue;
  }

  // What a Phaser object is, for how it's drawn.
  function kindOf(o, s) {
    if (o === s.player || s.partners.includes(o)) return 'hero';
    if (o === s.boss) return 'boss';
    if (s.drones.includes(o)) return 'drone';
    if (s.enemies.contains(o)) return 'enemy';
    if (s.bullets.contains(o) || s.enemyShots.contains(o)) return 'shot';
    if (s.pickups.contains(o)) return 'pickup';
    return 'other';
  }

  function make(kind) {
    const obj = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true }));
    if (['hero', 'enemy', 'boss'].includes(kind)) { // a soft shadow underfoot
      obj.userData.shadow = new THREE.Mesh(r.shadow.geo, r.shadow.mat);
      obj.userData.shadow.rotation.x = -Math.PI / 2;
      r.scene.add(obj.userData.shadow);
    }
    obj.userData.kind = kind;
    r.scene.add(obj);
    return obj;
  }

  // Ground decals for Phaser's circles and rectangles: explosions, mortar markers, lane slams, beams...
  function decal(o) {
    const geo = o.type === 'Arc' ? new THREE.CircleGeometry(1, 28) : new THREE.PlaneGeometry(1, 1);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.userData.decal = true;
    r.scene.add(m);
    return m;
  }

  function remove(obj) {
    r.scene.remove(obj);
    if (obj.userData.shadow) r.scene.remove(obj.userData.shadow);
    obj.material.dispose();
    if (obj.userData.decal) obj.geometry.dispose();
  }

  // How big things stand compared with their 2D sprite: shots bigger (they have no glow in 3D), the rest as in 2D.
  const SIZE = { shot: 1.6, pickup: 1.1 };
  function place(obj, o, kind) {
    if (obj.userData.decal) { // lying flat on the road
      obj.position.copy(at(o.x, o.y, 0.02 + (o.depth ?? 0) * 0.002));
      const round = o.type === 'Arc';
      obj.scale.set((round ? o.radius : o.width) * U * o.scaleX, (round ? o.radius : o.height) * U * o.scaleY, 1);
      obj.material.color.setHex(o.fillColor ?? 0xffffff);
      obj.material.opacity = (o.fillAlpha ?? 1) * o.alpha;
      return;
    }
    // Shots skip the 2D view's bright rings (Craig: you can see them fine in 3D): just the shot, a little bigger.
    const key = kind === 'shot' ? o.texture.key.split('~')[0] : o.texture.key, k = SIZE[kind] ?? 1;
    const src = game.textures.get(key).getSourceImage(), w = (kind === 'shot' ? src.width * o.scaleX : o.displayWidth) * U * k;
    const h = (kind === 'shot' ? src.height * o.scaleY : o.displayHeight) * U * k;
    obj.scale.set(w, h, 1);
    // Standing things put their feet where the bottom edge of their 2D sprite was, so they cover about the same
    // patch of road (and bosses near the top of the screen keep their heads on it).
    const feet = ['hero', 'enemy', 'boss', 'other'].includes(kind) ? o.y + o.displayHeight / 2 : o.y;
    obj.position.copy(at(o.x, feet, kind === 'shot' ? 0.35 : kind === 'drone' ? 0.75 : h / 2));
    const m = obj.material, flash = o.isTinted && o.tintFill, map = tex(key, flash ? 'white' : '');
    if (m.map !== map) { m.map = map; m.needsUpdate = true; }
    m.rotation = kind === 'shot' ? -o.rotation : 0;
    m.color.setHex(o.isTinted && !o.tintFill ? o.tintTopLeft : 0xffffff); // blue when frozen, orange when burning...
    m.opacity = o.alpha;
    const d = obj.userData;
    if (d.shadow) {
      d.shadow.position.copy(at(o.x, feet, 0.01));
      d.shadow.scale.setScalar(Math.max(0.12, w * 0.4));
    }
  }

  // HTML text: the HUD, banners and taunts stay where they are on screen (`screen`); toasts follow the world.
  function label(o, scale) {
    let el = labels.get(o);
    if (!el) {
      el = Object.assign(document.createElement('div'), { className: 'label3d' });
      r.overlay.append(el);
      labels.set(o, el);
    }
    if (el.textContent !== o.text) el.textContent = o.text;
    const st = o.style, px = parseFloat(st.fontSize) * scale, sw = Math.max(1, st.strokeThickness * scale * 0.5), sc = st.stroke;
    let x = o.x * scale, y = o.y * scale;
    if (!o.screen) {
      const p = at(o.x, o.y, 0.9).project(r.camera);
      x = (p.x + 1) / 2 * r.w;
      y = (1 - p.y) / 2 * r.h;
    }
    Object.assign(el.style, {
      left: `${x}px`, top: `${y}px`, fontSize: `${px}px`, color: st.color, textAlign: st.align, opacity: o.alpha,
      lineHeight: `${px + (o.lineSpacing || 0) * scale}px`, transform: `translate(${-o.originX * 100}%, ${-o.originY * 100}%)`,
      textShadow: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].map(([a, b]) => `${a * sw}px ${b * sw}px 0 ${sc}`).join(','),
    });
  }
  // A health bar over a soldier that has been hit (like the 2D ones).
  function healthBar(e, top) {
    let el = labels.get(e);
    if (!el) {
      el = Object.assign(document.createElement('div'), { className: 'bar3d', innerHTML: '<i></i>' });
      r.overlay.append(el);
      labels.set(e, el);
    }
    const p = at(e.x, e.y + e.displayHeight / 2, top + 0.08).project(r.camera);
    Object.assign(el.style, { left: `${(p.x + 1) / 2 * r.w}px`, top: `${(1 - p.y) / 2 * r.h}px` });
    el.firstChild.style.width = `${Math.max(0, e.hp / e.maxHp) * 100}%`;
  }

  function draw(s) {
    // Keep the 3D canvas and the HTML on top exactly over Phaser's (letterboxed) canvas.
    const rect = s.game.canvas.getBoundingClientRect();
    if (rect.width !== r.w || rect.height !== r.h || rect.left !== r.left || rect.top !== r.top) {
      Object.assign(r, { w: rect.width, h: rect.height, left: rect.left, top: rect.top });
      r.renderer.setSize(rect.width, rect.height, false);
      for (const el of [r.canvas, r.overlay]) Object.assign(el.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    }
    const scale = rect.width / W, t = s.t;
    // Road and sky follow the timeline; the road scrolls with the 2D one.
    const roadKey = (s.road.displayTexture ?? s.road.texture).key;
    if (roadKey !== r.roadKey) {
      r.roadKey = roadKey;
      r.road.material.map = tex(roadKey, 'road');
      r.road.material.needsUpdate = true;
      r.ground.material.color.setHex(edgeColour(roadKey));
      const sky = roadKey === 'road-1986' ? 0x140a26 : s.E.sky;
      r.scene.background = new THREE.Color(sky);
      r.scene.fog = new THREE.Fog(sky, 14, 34);
    }
    r.road.material.map.offset.y = -s.road.tilePositionY / 256;
    r.road.material.opacity = s.road.alpha;
    // The camera rides behind Vega, sliding halfway with him from side to side (the road is wider than the screen
    // near the bottom).
    const vx = (s.player.x - W / 2) * U * 0.5;
    r.camera.position.set(vx, CAM_H, CAM_Z);
    r.camera.lookAt(vx, 0, LOOK_Z);

    const seen = new Set();
    let n = 0;
    const pos = r.sparks.geometry.attributes.position, col = r.sparks.geometry.attributes.color, c = new THREE.Color();
    for (const o of s.children.list) {
      if (!o.visible || o.alpha <= 0) continue;
      if (o.type === 'Text') { seen.add(o); label(o, scale); continue; }
      if (o.type === 'ParticleEmitter') {
        for (const p of o.alive) {
          if (n >= r.MAXP) break;
          pos.setXYZ(n, (p.x - W / 2) * U, 0.3, (p.y - H) * U);
          c.setHex(p.tint ?? 0xffffff).multiplyScalar(p.alpha);
          col.setXYZ(n++, c.r, c.g, c.b);
        }
        continue;
      }
      if (o.type === 'Arc' || o.type === 'Rectangle') {
        seen.add(o);
        if (!things.has(o)) things.set(o, decal(o));
        place(things.get(o), o, 'decal');
        continue;
      }
      if ((o.type !== 'Image' && o.type !== 'Sprite') || o.texture.key === 'streak') continue;
      const kind = kindOf(o, s);
      seen.add(o);
      let obj = things.get(o);
      if (obj && obj.userData.kind !== kind) { remove(obj); obj = null; }
      if (!obj) things.set(o, obj = make(kind));
      place(obj, o, kind);
      if (kind === 'enemy' && o.hp < o.maxHp && o.maxHp > s.P.dmg) healthBar(o, obj.scale.y);
    }
    pos.needsUpdate = col.needsUpdate = true;
    r.sparks.geometry.setDrawRange(0, n);
    // Remove whatever has gone since the last frame.
    for (const [o, obj] of things) if (!seen.has(o)) { remove(obj); things.delete(o); }
    for (const [o, el] of labels) {
      const keep = o.type === 'Text' ? seen.has(o) : seen.has(o) && o.hp < o.maxHp;
      if (!keep) { el.remove(); labels.delete(o); }
    }
    // Vega's rings, and the boss's health bar along the top.
    const p = at(s.player.x, s.player.y, 0.03), live = s.player.active;
    [s.shield > 0, t < s.testudoUntil, t < s.nitroUntil].forEach((on, i) => { r.rings[i].visible = live && on; r.rings[i].position.copy(p); });
    const bar = r.overlay.querySelector('#bossbar3d');
    bar.hidden = !s.boss;
    if (s.boss) {
      Object.assign(bar.style, { left: `${60 * scale}px`, top: `${64 * scale}px`, width: `${(W - 120) * scale}px`, height: `${12 * scale}px` });
      bar.firstChild.style.width = `${Math.max(0, s.boss.hp / s.boss.maxHp) * 100}%`;
    }
    r.renderer.render(r.scene, r.camera);
  }

  return {
    // Called after every game step. 3D is on while you play on foot with Graphics set to 3D; menus, the main menu's
    // street and bonus chases are still drawn by Phaser.
    sync() {
      const s = scene(), on = settings.graphics === '3d' && !!s?.playing && s.view === 'top' && !!s.player && typeof THREE !== 'undefined';
      if (on && !r) setup();
      if (r) r.canvas.hidden = r.overlay.hidden = !on;
      if (s && s.sys.settings.visible === on) s.sys.setVisible(!on);
      active = on;
      if (!on) return;
      // Paused, in the shop or a menu: draw once and then rest.
      idle = app.state === 'playing' ? 0 : idle + 1;
      if (idle <= 1) draw(s);
    },
    // Where a screen point lands on the road, in game pixels (for steering with the mouse in 3D), or null.
    toGame(cx, cy) {
      if (!active) return null;
      const rect = r.canvas.getBoundingClientRect(), ray = new THREE.Raycaster(), hit = new THREE.Vector3();
      ray.setFromCamera(new THREE.Vector2((cx - rect.left) / rect.width * 2 - 1, 1 - (cy - rect.top) / rect.height * 2), r.camera);
      if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return null;
      return { x: hit.x / U + W / 2, y: hit.z / U + H };
    },
    // Where a game point shows on screen, 0-1 across and down the 3D canvas (for the playtest).
    toScreen(x, y) { const p = at(x, y).project(r.camera); return { x: (p.x + 1) / 2, y: (1 - p.y) / 2 }; },
    get active() { return active; },
    get stats() { // for the playtest: how many things of each kind are drawn
      const kinds = {};
      for (const o of things.values()) kinds[o.userData.kind ?? 'decal'] = (kinds[o.userData.kind ?? 'decal'] || 0) + 1;
      return { things: things.size, labels: labels.size, kinds };
    },
  };
})();
