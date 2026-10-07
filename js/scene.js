// Bühne: Renderer, Licht, Umgebung, Brett mit Bohrungen, Stecker, Säulen, Marker, Kamera.
import * as THREE from 'three';
import { PLUG_TOP } from './rope.js';

export const PLUG_R = 0.15;
const HOLE_R = 0.19;
const BOARD_T = 0.24;
const PILLAR_TOP = 0.46;

// ---------- prozedurale Texturen ----------
function woodTexture() {
  const W = 1024, H = 1024;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#8a5a34'); grd.addColorStop(0.5, '#9b6a3f'); grd.addColorStop(1, '#7f5230');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  // Maserung: verzerrte Sinuslinien
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 230; k++) {
    const y0 = rnd() * H, amp = 4 + rnd() * 16, f = 0.002 + rnd() * 0.006, ph = rnd() * 6.3;
    const dark = rnd() < 0.6;
    g.strokeStyle = dark ? `rgba(60,32,14,${0.08 + rnd() * 0.18})` : `rgba(200,150,95,${0.05 + rnd() * 0.12})`;
    g.lineWidth = 0.6 + rnd() * 2.6;
    g.beginPath();
    for (let x = 0; x <= W; x += 8) {
      const y = y0 + Math.sin(x * f + ph) * amp + Math.sin(x * f * 3.7 + ph * 2) * amp * 0.25;
      x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
  }
  // Astlöcher
  for (let k = 0; k < 3; k++) {
    const x = rnd() * W, y = rnd() * H, r = 10 + rnd() * 16;
    for (let i = 6; i > 0; i--) {
      g.strokeStyle = `rgba(50,25,10,${0.12 + 0.05 * i})`;
      g.lineWidth = 2;
      g.beginPath(); g.ellipse(x, y, r * i / 2.2, r * i / 5, 0, 0, Math.PI * 2); g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function feltTexture() {
  const W = 512;
  const c = document.createElement('canvas'); c.width = c.height = W;
  const g = c.getContext('2d');
  g.fillStyle = '#2b3446'; g.fillRect(0, 0, W, W);
  const img = g.getImageData(0, 0, W, W), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 18;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 6);
  return t;
}

function markerTexture() {
  const S = 128;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,90,80,0.95)');
  grd.addColorStop(0.45, 'rgba(255,40,40,0.55)');
  grd.addColorStop(1, 'rgba(255,0,0,0)');
  g.fillStyle = grd; g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'white'; g.lineWidth = 9; g.lineCap = 'round';
  g.beginPath(); g.moveTo(S * 0.38, S * 0.38); g.lineTo(S * 0.62, S * 0.62);
  g.moveTo(S * 0.62, S * 0.38); g.lineTo(S * 0.38, S * 0.62); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture() {
  const S = 128;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, S * 0.2, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.55, 'rgba(255,255,255,1)');
  grd.addColorStop(0.7, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}

// Umgebung für Spiegelungen (wie RoomEnvironment, aber selbst gebaut)
function envScene() {
  const s = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(24, 12, 24),
    new THREE.MeshBasicMaterial({ color: 0x3b3833, side: THREE.BackSide }));
  room.position.y = 5;
  s.add(room);
  const panel = (w, h, x, y, z, ry, rx, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k * 0.96, k * 0.9), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.rotation.set(rx, ry, 0); s.add(m);
  };
  panel(10, 6, 0, 10.9, 0, 0, Math.PI / 2, 5);     // Deckenleuchte
  panel(6, 4, -11.8, 5, -2, Math.PI / 2, 0, 3);    // Fenster links
  panel(5, 3, 11.8, 4, 4, -Math.PI / 2, 0, 1.6);
  panel(8, 3, 0, 4, -11.8, 0, 0, 2.2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), new THREE.MeshBasicMaterial({ color: 0x1e2230 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.9; s.add(floor);
  return s;
}

// ---------- Bühne ----------
export class Stage {
  constructor(container) {
    this.container = container;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    const pm = new THREE.PMREMGenerator(r);
    this.scene.environment = pm.fromScene(envScene(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    pm.dispose();

    const sun = this.sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
    sun.position.set(-3.5, 9, 4.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.015;
    sun.shadow.radius = 4;
    this.scene.add(sun, sun.target);
    this.scene.add(new THREE.HemisphereLight(0xcfe2ff, 0x3a2a1c, 0.5));

    const table = new THREE.Mesh(new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ map: feltTexture(), roughness: 0.95, color: 0xb8c0d0 }));
    table.rotation.x = -Math.PI / 2;
    table.position.y = -BOARD_T - 0.05;
    table.receiveShadow = true;
    this.scene.add(table);

    this.wood = woodTexture();
    this.markerTex = markerTexture();
    this.glowTex = glowTexture();
    this.boardGroup = new THREE.Group();
    this.scene.add(this.boardGroup);

    // gemeinsame Materialien
    this.mat = {
      brass: new THREE.MeshStandardMaterial({ color: 0xd9ad62, metalness: 1, roughness: 0.28 }),
      sleeve: new THREE.MeshStandardMaterial({ color: 0x15110e, roughness: 0.9, side: THREE.DoubleSide }),
      steel: new THREE.MeshStandardMaterial({ color: 0xb9c0c8, metalness: 1, roughness: 0.22 }),
      darkSteel: new THREE.MeshStandardMaterial({ color: 0x4a515c, metalness: 0.9, roughness: 0.35 }),
      chrome: new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 1, roughness: 0.12 }),
    };
    this.geo = {
      ring: new THREE.TorusGeometry(HOLE_R + 0.012, 0.026, 10, 40).rotateX(Math.PI / 2),
      sleeve: new THREE.CylinderGeometry(HOLE_R, HOLE_R, BOARD_T + 0.02, 28, 1, true),
      hole: new THREE.CircleGeometry(HOLE_R, 28).rotateX(-Math.PI / 2),
      plugBody: new THREE.CylinderGeometry(PLUG_R, PLUG_R * 1.04, 0.3, 32),
      plugCap: new THREE.CylinderGeometry(PLUG_R * 0.72, PLUG_R, 0.06, 32),
      plugBoot: new THREE.CylinderGeometry(0.068, 0.1, 0.07, 24),
      led: new THREE.TorusGeometry(PLUG_R + 0.004, 0.017, 8, 40).rotateX(Math.PI / 2),
      clamp: new THREE.TorusGeometry(PLUG_R + 0.03, 0.035, 10, 40).rotateX(Math.PI / 2),
      bolt: new THREE.CylinderGeometry(0.045, 0.05, 0.05, 6),
      slot: new THREE.BoxGeometry(0.075, 0.02, 0.014),
      groove: new THREE.TorusGeometry(PLUG_R + 0.002, 0.008, 6, 40).rotateX(Math.PI / 2),
    };

    // Hervorhebungen
    const glow = (color) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.75).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ map: this.glowTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false; m.renderOrder = 5;
      this.scene.add(m);
      return m;
    };
    this.dropGlow = glow(0x9fe8ff);
    this.hintGlow = glow(0xffd84a);
    this.hintArc = null;
    this.markers = [];

    this.camAz = 0;
    this.margins = { top: 64, bottom: 84 };
    this.raycaster = new THREE.Raycaster();
    this.resize();
  }

  // ---------- Brett ----------
  buildBoard(cols, rows, pillars) {
    const g = this.boardGroup;
    while (g.children.length) {
      const c = g.children.pop();
      c.traverse((o) => { if (o.geometry && !Object.values(this.geo).includes(o.geometry)) o.geometry.dispose(); });
    }
    this.cols = cols; this.rows = rows;
    const w = cols - 1 + 1.3, d = rows - 1 + 1.3, rad = 0.38;
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2 + rad, -d / 2);
    shape.lineTo(w / 2 - rad, -d / 2); shape.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + rad);
    shape.lineTo(w / 2, d / 2 - rad); shape.quadraticCurveTo(w / 2, d / 2, w / 2 - rad, d / 2);
    shape.lineTo(-w / 2 + rad, d / 2); shape.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - rad);
    shape.lineTo(-w / 2, -d / 2 + rad); shape.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + rad, -d / 2);
    this.socketWorld = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const wx = x - (cols - 1) / 2, wz = y - (rows - 1) / 2;
      this.socketWorld.push(new THREE.Vector3(wx, 0, wz));
      const h = new THREE.Path();
      h.absarc(wx, -wz, HOLE_R, 0, Math.PI * 2, true);
      shape.holes.push(h);
    }
    const bev = 0.035;
    const geo = new THREE.ExtrudeGeometry(shape, { depth: BOARD_T - bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 3, curveSegments: 20 });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, -BOARD_T + bev, 0);
    this.wood.repeat.set(0.16, 0.16);
    const board = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({
      map: this.wood, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.35,
    }));
    board.castShadow = true; board.receiveShadow = true;
    g.add(board);

    for (const p of this.socketWorld) {
      const ring = new THREE.Mesh(this.geo.ring, this.mat.brass);
      ring.position.set(p.x, 0.004, p.z); ring.receiveShadow = true;
      const sl = new THREE.Mesh(this.geo.sleeve, this.mat.sleeve);
      sl.position.set(p.x, -BOARD_T / 2, p.z);
      const bot = new THREE.Mesh(this.geo.hole, this.mat.sleeve);
      bot.position.set(p.x, -BOARD_T + 0.01, p.z);
      g.add(ring, sl, bot);
    }

    this.pillarWorld = [];
    for (const [x, y] of pillars) {
      const wx = x + 0.5 - (cols - 1) / 2, wz = y + 0.5 - (rows - 1) / 2;
      this.pillarWorld.push(new THREE.Vector3(wx, 0, wz));
      const grp = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.21, 0.05, 32), this.mat.darkSteel);
      base.position.y = 0.025;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.14, PILLAR_TOP - 0.1, 32), this.mat.steel);
      col.position.y = (PILLAR_TOP - 0.1) / 2 + 0.03;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.13, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshPhysicalMaterial({ color: 0xd62828, roughness: 0.25, clearcoat: 1 }));
      cap.position.y = PILLAR_TOP - 0.07;
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.142, 0.018, 8, 32).rotateX(Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0xe8b33a, metalness: 0.3, roughness: 0.4 }));
      band.position.y = 0.3;
      [base, col, cap, band].forEach((m) => { m.castShadow = true; m.receiveShadow = true; grp.add(m); });
      grp.position.set(wx, 0, wz);
      g.add(grp);
    }

    // Schattenkamera ans Brett anpassen
    const s = this.sun.shadow.camera, ext = Math.max(w, d) / 2 + 1.2;
    s.left = -ext; s.right = ext; s.top = ext; s.bottom = -ext; s.near = 0.5; s.far = 30;
    s.updateProjectionMatrix();
    this.boardSize = { w, d };
    this.fit();
  }

  makePlug(color, locked) {
    const g = new THREE.Group();
    const c = new THREE.Color(color);
    const bodyMat = new THREE.MeshPhysicalMaterial({ color: c.clone().multiplyScalar(0.92), roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2 });
    const body = new THREE.Mesh(this.geo.plugBody, bodyMat);
    body.position.y = 0.05;
    const cap = new THREE.Mesh(this.geo.plugCap, locked ? this.mat.steel : this.mat.chrome);
    cap.position.y = 0.23;
    const boot = new THREE.Mesh(this.geo.plugBoot, bodyMat);
    boot.position.y = PLUG_TOP - 0.04;
    const ledMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0x30ff70, emissiveIntensity: 1.6, roughness: 0.3 });
    const led = new THREE.Mesh(this.geo.led, ledMat);
    led.position.y = 0.14;
    const groove = new THREE.Mesh(this.geo.groove, this.mat.darkSteel);
    groove.position.y = 0.08;
    [body, cap, boot, groove].forEach((m) => { m.castShadow = true; m.receiveShadow = true; });
    g.add(body, cap, boot, led, groove);
    if (locked) {
      const clamp = new THREE.Mesh(this.geo.clamp, this.mat.darkSteel);
      clamp.position.y = 0.03; clamp.castShadow = true;
      g.add(clamp);
      for (const a of [0.6, 0.6 + Math.PI]) {
        const bolt = new THREE.Mesh(this.geo.bolt, this.mat.steel);
        bolt.position.set(Math.cos(a) * 0.25, 0.025, Math.sin(a) * 0.25);
        const slot = new THREE.Mesh(this.geo.slot, this.mat.darkSteel);
        slot.position.set(Math.cos(a) * 0.25, 0.052, Math.sin(a) * 0.25);
        slot.rotation.y = a;
        bolt.castShadow = true;
        g.add(bolt, slot);
      }
    }
    g.userData = { ledMat, bodyMat };
    this.scene.add(g);
    return g;
  }

  removeObject(o) {
    this.scene.remove(o);
    o.traverse((m) => {
      if (m.material && m.material !== this.mat.chrome && !Object.values(this.mat).includes(m.material)) m.material.dispose();
    });
  }

  // ---------- Marker ----------
  setMarkers(list) {
    while (this.markers.length < list.length) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.markerTex, depthTest: false, transparent: true }));
      s.renderOrder = 10;
      this.scene.add(s);
      this.markers.push(s);
    }
    this.markers.forEach((m, i) => {
      m.visible = i < list.length;
      if (m.visible) { m.position.copy(list[i].pos); m.userData.phase = list[i].phase || 0; }
    });
  }

  animateMarkers(t) {
    for (const m of this.markers) {
      if (!m.visible) continue;
      const s = 0.3 + 0.04 * Math.sin(t * 5 + m.userData.phase);
      m.scale.set(s, s, 1);
    }
  }

  showHintArc(from, to) {
    this.clearHintArc();
    const mid = from.clone().add(to).multiplyScalar(0.5);
    mid.y = 1.1 + from.distanceTo(to) * 0.15;
    const curve = new THREE.QuadraticBezierCurve3(from.clone().setY(0.55), mid, to.clone().setY(0.15));
    const geo = new THREE.TubeGeometry(curve, 40, 0.025, 8, false);
    this.hintArc = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffd84a, transparent: true, opacity: 0.85, depthTest: false }));
    this.hintArc.renderOrder = 9;
    this.scene.add(this.hintArc);
  }
  clearHintArc() {
    if (this.hintArc) { this.scene.remove(this.hintArc); this.hintArc.geometry.dispose(); this.hintArc.material.dispose(); this.hintArc = null; }
  }

  // ---------- Kamera ----------
  resize() {
    const w = this.container.clientWidth || window.innerWidth, h = this.container.clientHeight || window.innerHeight;
    this.W = w; this.H = h;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    this.fit();
  }

  fit() {
    if (!this.boardSize) return;
    const cam = this.camera, W = this.W, H = this.H;
    const { w, d } = this.boardSize;
    const portrait = H > W * 1.05;
    // Langes Brett an die lange Bildschirmseite legen
    this.camAz = ((portrait && w > d + 0.01) || (!portrait && d > w + 0.01)) ? Math.PI / 2 : 0;
    const el = THREE.MathUtils.degToRad(60);
    cam.aspect = W / H;
    cam.clearViewOffset();
    const pts = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [-BOARD_T, 0.55]) pts.push(new THREE.Vector3(sx * w / 2, y, sz * d / 2));
    const dir = new THREE.Vector3(Math.sin(this.camAz) * Math.cos(el), Math.sin(el), Math.cos(this.camAz) * Math.cos(el));
    const top = this.margins.top, bot = this.margins.bottom, band = Math.max(100, H - top - bot);
    const v = new THREE.Vector3();
    const measure = (dist) => {
      cam.position.copy(dir).multiplyScalar(dist);
      cam.lookAt(0, 0, 0);
      cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const p of pts) { v.copy(p).project(cam); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
      return { x0, x1, y0, y1 };
    };
    let lo = 2, hi = 60;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2, b = measure(mid);
      const ok = (b.x1 - b.x0) * W / 2 <= W * 0.94 - 24 && (b.y1 - b.y0) * H / 2 <= band * 0.96;
      if (ok) hi = mid; else lo = mid;
    }
    const b = measure(hi);
    const cx = ((b.x0 + b.x1) / 2 + 1) * W / 2;            // Pixel von links
    const cy = (1 - (b.y0 + b.y1) / 2) * H / 2;            // Pixel von oben
    const shiftX = W / 2 - cx, shiftY = top + band / 2 - cy;
    cam.setViewOffset(W, H, -shiftX, -shiftY, W, H);
    cam.updateProjectionMatrix();
  }

  // Bildschirm -> Ebene y = h
  rayToPlane(clientX, clientY, h) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const out = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -h), out);
    return hit ? out : null;
  }

  toScreen(p) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const v = p.clone().project(this.camera);
    return { x: rect.left + (v.x + 1) / 2 * rect.width, y: rect.top + (1 - v.y) / 2 * rect.height };
  }

  render() { this.renderer.render(this.scene, this.camera); }
}

export { PILLAR_TOP };
