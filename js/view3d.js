// The 3D view (Settings: Graphics 3D). Phaser keeps running the game exactly as in 2D (waves, physics, bosses, shop,
// all of it); this draws the same world with three.js from a chase camera behind Vega, every frame, and Phaser stops
// drawing. The ground plane is the 2D screen laid flat: game x runs across the road, game y along it (1 unit =
// 100 game pixels). Sprites with a model in MODELS3D become models; everything else is an upright cut-out of its
// 2D sprite, so every timeline works while models are added. Text (HUD, banners, taunts, toasts) is drawn as HTML on
// top. Bonus chases stay 2D for now.
const view3d = (() => {
  const U = 0.01, at = (x, y, h = 0) => new THREE.Vector3((x - W / 2) * U, h, (y - H) * U);
  const things = new Map(); // Phaser object -> its 3D stand-in
  const labels = new Map(); // Phaser text, or an enemy's health bar -> its HTML element
  const textures = new Map(); // Phaser texture key -> THREE.Texture
  let r = null, active = false, idle = 0;

  function setup() {
    const canvas = Object.assign(document.createElement('canvas'), { id: 'view3d' });
    const overlay = Object.assign(document.createElement('div'), { id: 'overlay3d' });
    overlay.innerHTML = '<div id="bossbar3d"><i></i></div>';
    document.body.append(canvas, overlay);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 80);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x665577, 0.95));
    const sun = new THREE.DirectionalLight(0xffffff, 0.65);
    sun.position.set(-3, 8, 5);
    scene.add(sun);
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

  // A Phaser texture as a three.js one (made once per key). `road`: repeating along its length.
  function tex(key, road = false) {
    const id = road ? `road:${key}` : key;
    if (!textures.has(id)) {
      const t = new THREE.Texture(game.textures.get(key).getSourceImage());
      t.magFilter = THREE.NearestFilter;
      if (road) {
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
    if (o === s.player) return 'vega';
    if (o === s.boss) return 'boss';
    if (s.partners.includes(o)) return 'partner';
    if (s.drones.includes(o)) return 'drone';
    if (s.enemies.contains(o)) return 'enemy';
    if (s.bullets.contains(o) || s.enemyShots.contains(o)) return 'shot';
    if (s.pickups.contains(o)) return 'pickup';
    return 'other';
  }

  function make(o, kind) {
    const key = kind === 'boss' ? o.cfg.key : kind === 'vega' || kind === 'partner' || kind === 'drone' ? kind : o.texture.key;
    let obj = MODELS3D[key]?.();
    if (obj) obj.userData.model = key;
    else {
      obj = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(o.texture.key), transparent: true }));
      obj.userData.mats = [obj.material];
    }
    if (['vega', 'partner', 'enemy', 'boss'].includes(kind)) { // a soft shadow underfoot
      obj.userData.shadow = new THREE.Mesh(r.shadow.geo, r.shadow.mat);
      obj.userData.shadow.rotation.x = -Math.PI / 2;
      r.scene.add(obj.userData.shadow);
    }
    obj.userData.kind = kind;
    obj.userData.base = obj.scale.x;
    r.scene.add(obj);
    return obj;
  }

  // Ground decals for Phaser's circles and rectangles: explosions, mortar markers, lane slams, beams...
  function decal(o) {
    const round = o.type === 'Arc', geo = round ? new THREE.CircleGeometry(1, 28) : new THREE.PlaneGeometry(1, 1);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.userData = { decal: true, mats: [m.material] };
    r.scene.add(m);
    return m;
  }

  function remove(obj) {
    r.scene.remove(obj);
    if (obj.userData.shadow) r.scene.remove(obj.userData.shadow);
    for (const m of obj.userData.mats ?? []) m.dispose();
    if (obj.userData.decal) obj.geometry.dispose();
  }

  // Tints and flashes on a model: white when hit, blue when frozen, orange when burning, red while winding up.
  const GLOW = { 0x88ccff: 0x2266aa, 0xff9944: 0x993300, 0xff5050: 0x991111 };
  function paint(obj, o, kind) {
    const hurt = kind === 'boss' && o.texture.key.endsWith('Hurt');
    const glow = o.isTinted && o.tintFill ? 0xffffff : hurt ? 0x881111 : o.isTinted ? GLOW[o.tintTopLeft] ?? 0 : 0;
    for (const m of obj.userData.mats) {
      m.opacity = o.alpha;
      if (m.emissive) m.emissive.setHex(glow);
      else m.color.setHex(o.isTinted && !o.tintFill ? o.tintTopLeft : 0xffffff);
    }
  }

  function place(obj, o, kind, s, t) {
    const d = obj.userData;
    if (d.decal) { // lying flat on the road
      const pos = at(o.x, o.y, 0.02 + (o.depth ?? 0) * 0.002);
      obj.position.copy(pos);
      obj.scale.set(o.type === 'Arc' ? o.radius * U * o.scaleX : o.width * U * o.scaleX, o.type === 'Arc' ? o.radius * U * o.scaleY : o.height * U * o.scaleY, 1);
      obj.material.color.setHex(o.fillColor ?? 0xffffff);
      obj.material.opacity = (o.fillAlpha ?? 1) * o.alpha;
      return;
    }
    const sprite = !d.model;
    let h = 0;
    if (sprite) { // cut-outs stand on the road (shots fly at gun height), sized like their 2D sprite
      const k = kind === 'boss' ? 1.6 : kind === 'shot' ? 1.3 : 1;
      obj.scale.set(o.displayWidth * U * k, o.displayHeight * U * k, 1);
      h = kind === 'shot' ? 0.35 : o.displayHeight * U * k / 2;
      obj.material.rotation = kind === 'shot' ? -o.rotation : 0;
      if (obj.material.map !== tex(o.texture.key)) obj.material.map = tex(o.texture.key); // animation frames
    } else {
      h = d.hover ?? 0;
      if (d.spin) obj.rotation.y += d.spin / 60;
      else if (kind === 'vega' || kind === 'partner') obj.rotation.y = Math.PI; // walking up the road, away from us
      else if (kind !== 'drone') obj.rotation.y = Math.atan2(s.player.x - o.x, s.player.y - o.y) * 0.6; // facing Vega
      if (d.legs) { // walking (Vega and partners always are: the road moves under them)
        const swing = Math.sin(t / 90 + o.x) * 0.6;
        d.legs[0].rotation.x = swing;
        d.legs[1].rotation.x = -swing;
      }
      if (kind === 'boss') h = Math.abs(Math.sin(t / 300)) * 0.08; // idle bob
      const squash = kind === 'boss' && o.texture.key.endsWith('Hurt') ? 0.9 : 1;
      obj.scale.set(d.base, d.base * squash, d.base);
    }
    obj.position.copy(at(o.x, o.y, h));
    paint(obj, o, kind);
    if (d.shadow) {
      d.shadow.position.copy(at(o.x, o.y, 0.01));
      d.shadow.scale.setScalar(kind === 'boss' ? 0.8 : 0.22);
      d.shadow.visible = o.visible;
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
    return el;
  }
  // A health bar over a soldier that has been hit (like the 2D ones).
  function healthBar(e) {
    let el = labels.get(e);
    if (!el) {
      el = Object.assign(document.createElement('div'), { className: 'bar3d', innerHTML: '<i></i>' });
      r.overlay.append(el);
      labels.set(e, el);
    }
    const p = at(e.x, e.y, 0.8).project(r.camera);
    Object.assign(el.style, { left: `${(p.x + 1) / 2 * r.w}px`, top: `${(1 - p.y) / 2 * r.h}px` });
    el.firstChild.style.width = `${Math.max(0, e.hp / e.maxHp) * 100}%`;
    return el;
  }

  function draw(s) {
    // Keep the 3D canvas and the HTML on top exactly over Phaser's (letterboxed) canvas.
    const rect = s.game.canvas.getBoundingClientRect();
    if (rect.width !== r.w || rect.height !== r.h || rect.left !== r.left || rect.top !== r.top) {
      Object.assign(r, { w: rect.width, h: rect.height, left: rect.left, top: rect.top });
      r.renderer.setSize(rect.width, rect.height, false);
      for (const el of [r.canvas, r.overlay]) Object.assign(el.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    }
    const scale = rect.width / W, t = s.t, E = s.E;
    // Road and sky follow the timeline; the road scrolls with the 2D one.
    const roadKey = (s.road.displayTexture ?? s.road.texture).key;
    if (roadKey !== r.roadKey) {
      r.roadKey = roadKey;
      r.road.material.map = tex(roadKey, true);
      r.road.material.needsUpdate = true;
      r.ground.material.color.setHex(edgeColour(roadKey));
      const sky = roadKey === 'road-1986' ? 0x140a26 : E.sky;
      r.scene.background = new THREE.Color(sky);
      r.scene.fog = new THREE.Fog(sky, 14, 34);
    }
    r.road.material.map.offset.y = -s.road.tilePositionY / 256;
    r.road.material.opacity = s.road.alpha;
    // The camera rides behind Vega, drifting a little with him from side to side.
    const vx = (s.player.x - W / 2) * U * 0.4;
    r.camera.position.set(vx, 6.2, 3.4);
    r.camera.lookAt(vx * 0.6, 0, -4.2);

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
        place(things.get(o), o, 'decal', s, t);
        continue;
      }
      if ((o.type !== 'Image' && o.type !== 'Sprite') || o.texture.key === 'streak') continue;
      const kind = kindOf(o, s);
      seen.add(o);
      let obj = things.get(o);
      if (obj && obj.userData.kind !== kind) { remove(obj); obj = null; }
      if (!obj) things.set(o, obj = make(o, kind));
      place(obj, o, kind, s, t);
      if (kind === 'enemy' && o.hp < o.maxHp && o.maxHp > s.P.dmg) healthBar(o);
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
    get active() { return active; },
    get stats() { // for the playtest: how many things of each kind are drawn, and how many as models
      const kinds = {};
      for (const o of things.values()) kinds[o.userData.kind ?? 'decal'] = (kinds[o.userData.kind ?? 'decal'] || 0) + 1;
      return { things: things.size, models: [...things.values()].filter(o => o.userData.model).length, labels: labels.size, kinds };
    },
  };
})();
