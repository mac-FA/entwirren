// Entwirren — Spielablauf, Eingabe, Oberfläche.
import * as THREE from 'three';
import { Stage, PLUG_R, PILLAR_TOP } from './scene.js';
import { Rope, PLUG_TOP } from './rope.js';
import { Sound } from './audio.js';

const T = window.Tangle;
const LEVELS = window.TANGLE_LEVELS || [];

const COLORS = [0xe63946, 0x3a86ff, 0xfcbf49, 0x2a9d4f, 0xf77f00, 0x9d4edd, 0x4cc9f0, 0xf15bb5,
  0xf1f1f1, 0x8ac926, 0x8d5a3b, 0x2ec4b6, 0x5a3fd6, 0x3a3a46, 0xffafcc];
const LIFT = 0.85;
const SUB = 1 / 120;

const CHAPTERS = [
  { from: 0, to: 14, name: 'Grundlagen' },
  { from: 15, to: 24, name: 'Säulen' },
  { from: 25, to: 34, name: 'Festgeschraubt' },
  { from: 35, to: 44, name: 'Enger Platz' },
  { from: 45, to: 59, name: 'Meister' },
];
const chapterOf = (i) => CHAPTERS.find((c) => i >= c.from && i <= c.to) || CHAPTERS[CHAPTERS.length - 1];
const TIPS = {
  0: 'Zieh einen Stecker auf ein freies Loch – so lange, bis sich kein Schlauch mehr kreuzt.',
  2: 'Rote Kreuze markieren jede Verhedderung. Die grüne Leuchte am Stecker heißt: Dieser Schlauch ist frei.',
  5: 'Ziel ist das Optimum: so wenige Züge wie möglich. Dann gibt es drei Sterne.',
  9: 'Kniff: Manchmal muss man einen Schlauch bewegen, der gar nicht verheddert ist.',
  15: 'Neu: Säulen. Kein Schlauch darf über eine Säule laufen.',
  25: 'Neu: Festgeschraubte Stecker (Stahlkappe mit Schrauben) bleiben, wo sie sind.',
  35: 'Weniger freie Löcher – manchmal muss erst Platz geschaffen werden.',
  45: 'Meisterklasse. Viel Erfolg!',
};
const RANDOM = {
  leicht: { label: 'Leicht', params: { c: 4, r: 4, n: 4, parMin: 2, parMax: 3 } },
  mittel: { label: 'Mittel', params: { c: 5, r: 5, n: 6, parMin: 4, parMax: 5, pillars: 1, locks: 1 } },
  schwer: { label: 'Schwer', params: { c: 5, r: 6, n: 8, parMin: 5, parMax: 6, pillars: 2, locks: 2 } },
  meister: { label: 'Meister', params: { c: 6, r: 6, n: 10, parMin: 6, parMax: 7, pillars: 2, locks: 3 } },
};

// ---------- Speicher ----------
const KEY = 'entwirren.v1';
const store = (() => {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { s = {}; }
  s.best = s.best || {};
  if (s.sound === undefined) s.sound = true;
  s.tips = s.tips || {};
  return s;
})();
function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* privat */ } }
function stars(moves, par) { return moves <= par ? 3 : moves <= par + 2 ? 2 : 1; }
function maxSolved() { let m = -1; for (const k in store.best) m = Math.max(m, +k); return m; }
function unlocked(i) { return i <= maxSolved() + 2; }

const $ = (id) => document.getElementById(id);

// ---------- Spiel ----------
class Game {
  constructor() {
    this.stage = new Stage($('stage'));
    this.ropes = []; this.plugs = [];
    this.history = [];
    this.acc = 0; this.time = 0;
    this.confetti = null;
    this.worker = null;
    this.reqId = 0; this.pending = {};
    try {
      this.worker = new Worker('js/worker.js');
      this.worker.onmessage = (e) => { const cb = this.pending[e.data.id]; delete this.pending[e.data.id]; if (cb) cb(e.data); };
    } catch (e) { this.worker = null; }
    Sound.setEnabled(store.sound);
    this.bindInput();
    this.bindUI();
    window.addEventListener('resize', () => this.stage.resize());
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  ask(msg, cb) {
    if (!this.worker) {
      // Ersatz ohne Worker: synchron rechnen
      setTimeout(() => {
        if (msg.type === 'solve') {
          const b = T.makeBoard(msg.level);
          const r = T.solve(b, msg.pos, { maxDepth: 14, budget: 4e5 });
          cb(r ? { ok: true, moves: r.moves, optimal: true } : { ok: true, moves: [T.greedyMove(b, msg.pos)], optimal: false });
        } else {
          let lv = null;
          for (let k = 0; !lv && k < 30; k++) lv = T.generate(Object.assign({}, msg.params, { attempts: 20, budget: 3e5 }), msg.seed + k * 7919);
          cb({ ok: !!lv, level: lv });
        }
      }, 10);
      return;
    }
    const id = ++this.reqId;
    this.pending[id] = cb;
    this.worker.postMessage(Object.assign({ id }, msg));
  }

  // ---------- Level laden ----------
  loadLevel(index) {
    const lv = LEVELS[index];
    if (!lv) return;
    this.mode = 'level';
    this.levelIndex = index;
    store.last = index; save();
    this.setup(lv);
    const ch = chapterOf(index);
    $('hudLevel').textContent = `Level ${index + 1}`;
    $('hudSub').textContent = ch.name;
    if (TIPS[index] && !store.tips[index]) {
      store.tips[index] = 1; save();
      setTimeout(() => this.toast(TIPS[index], 6000), 700);
    }
  }

  loadRandom(key) {
    const cfg = RANDOM[key];
    this.showLoading(true);
    this.ask({ type: 'gen', params: cfg.params, seed: (Math.random() * 1e9) | 0 }, (res) => {
      this.showLoading(false);
      if (!res.ok || !res.level) { this.toast('Kein Rätsel gefunden – bitte nochmal versuchen.'); return; }
      this.mode = 'random';
      this.randomKey = key;
      this.setup(res.level);
      $('hudLevel').textContent = 'Zufallsrätsel';
      $('hudSub').textContent = cfg.label;
      hideScreens();
    });
  }

  setup(lv) {
    const st = this.stage;
    this.level = lv;
    for (const r of this.ropes) { st.scene.remove(r.mesh); r.dispose(); }
    for (const p of this.plugs) st.removeObject(p.mesh);
    if (this.confetti) { st.scene.remove(this.confetti.points); this.confetti = null; }
    this.board = T.makeBoard(lv);
    this.pos = Int16Array.from(lv.p);
    this.layers = (lv.l || [...Array(this.board.N).keys()]).slice();
    this.history = [];
    this.moves = 0;
    this.won = false;
    this.drag = null; this.selected = null; this.hint = null;
    st.clearHintArc(); st.hintGlow.visible = false; st.dropGlow.visible = false;
    st.buildBoard(lv.c, lv.r, lv.k || []);

    const N = this.board.N;
    this.ropes = [];
    for (let r = 0; r < N; r++) {
      const rope = new Rope(COLORS[r % COLORS.length]);
      st.scene.add(rope.mesh);
      this.ropes.push(rope);
    }
    this.plugs = [];
    for (let p = 0; p < 2 * N; p++) {
      const locked = !!this.board.locked[p];
      const mesh = st.makePlug(COLORS[(p >> 1) % COLORS.length], locked);
      const s = st.socketWorld[this.pos[p]];
      const plug = { p, rope: p >> 1, mesh, locked, x: s.x, y: 0, z: s.z, tx: s.x, tz: s.z, ty: 0, mode: 'rest', shake: 0, onLand: null };
      mesh.position.set(s.x, 0, s.z);
      this.plugs.push(plug);
    }
    this.pillarObs = (st.pillarWorld || []).map((w) => ({ x: w.x, z: w.z, r: 0.14, top: PILLAR_TOP, round: 0.08, owner: null }));
    this.refresh(true);
    hideWin();
  }

  // ---------- Zustand auswerten ----------
  refresh(silent) {
    const before = this.analysis ? this.analysis.tangledCount : null;
    this.analysis = T.analyze(this.board, this.pos);
    if (!silent && before !== null && this.analysis.tangledCount < before && !this.analysis.solved) Sound.free();
    this.updateHud();
  }

  updateHud() {
    $('hudMoves').textContent = this.moves;
    $('hudPar').textContent = this.level.par;
    const x = this.analysis.conflicts.length;
    $('hudX').textContent = x;
    $('statX').classList.toggle('ok', x === 0);
    $('btnUndo').disabled = !this.history.length || this.won;
    $('hudMoves').parentElement.classList.toggle('over', this.moves > this.level.par);
  }

  socketWorld(s) { return this.stage.socketWorld[s]; }

  // ---------- Züge ----------
  pickUp(plug) {
    if (this.won) return;
    if (plug.locked) { plug.shake = 0.4; Sound.deny(); this.toast('Dieser Stecker ist festgeschraubt.', 1800); return; }
    this.clearHint();
    this.pendingLayers = this.layers.slice();
    const r = plug.rope;
    this.layers.splice(this.layers.indexOf(r), 1); this.layers.push(r);
    Sound.pick();
  }

  commitMove(plug, to) {
    const from = this.pos[plug.p];
    if (to === from) { this.land(plug, from, false); this.layers = this.pendingLayers || this.layers; return; }
    this.history.push({ p: plug.p, from, to, layers: this.pendingLayers || this.layers.slice() });
    this.pos[plug.p] = to;
    this.moves++;
    this.land(plug, to, true);
    this.updateHud();
  }

  land(plug, s, counts) {
    const w = this.socketWorld(s);
    plug.mode = 'fly'; plug.tx = w.x; plug.tz = w.z;
    plug.onLand = () => {
      Sound.drop();
      this.refresh(!counts);
      this.checkWin();
    };
  }

  undo() {
    if (!this.history.length || this.won || this.drag) return;
    const h = this.history.pop();
    this.clearHint();
    const plug = this.plugs[h.p];
    this.pos[h.p] = h.from;
    this.layers = h.layers;
    this.moves--;
    if (this.selected) { this.selected.mode = 'fly'; this.selected = null; }
    const w = this.socketWorld(h.from);
    plug.mode = 'fly'; plug.tx = w.x; plug.tz = w.z;
    plug.onLand = () => { Sound.back(); this.refresh(true); };
    this.updateHud();
  }

  restart() {
    if (this.drag) return;
    if (this.mode === 'level') this.loadLevel(this.levelIndex);
    else this.setup(this.level);
  }

  checkWin() {
    if (this.won || !this.analysis.solved) return;
    if (this.plugs.some((p) => p.mode !== 'rest')) return;
    this.won = true;
    this.updateHud();
    Sound.win();
    this.celebrate();
    let st = stars(this.moves, this.level.par), isBest = false;
    if (this.mode === 'level') {
      const prev = store.best[this.levelIndex];
      if (prev === undefined || this.moves < prev) { store.best[this.levelIndex] = this.moves; isBest = prev !== undefined; save(); }
    }
    setTimeout(() => showWin(this, st, isBest), 1300);
  }

  celebrate() {
    // Schläuche hüpfen nacheinander
    this.layers.forEach((r, k) => setTimeout(() => {
      const rope = this.ropes[r];
      for (let i = 1; i < rope.n - 1; i++) rope.py[i] -= 0.022 * Math.sin(Math.PI * i / (rope.n - 1));
    }, k * 70));
    // Konfetti
    const n = 420, geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), vel = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 0.6; pos[i * 3 + 1] = 0.3; pos[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
      const a = Math.random() * Math.PI * 2, sp = 1.2 + Math.random() * 2.6;
      vel[i * 3] = Math.cos(a) * sp; vel[i * 3 + 1] = 3 + Math.random() * 4; vel[i * 3 + 2] = Math.sin(a) * sp;
      c.setHex(COLORS[i % Math.min(COLORS.length, Math.max(3, this.board.N))]);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.075, vertexColors: true, transparent: true, opacity: 1, depthWrite: false }));
    this.stage.scene.add(pts);
    this.confetti = { points: pts, vel, t: 0 };
  }

  // ---------- Tipp ----------
  requestHint() {
    if (this.won || this.drag || this.hintBusy) return;
    this.hintBusy = true;
    $('btnHint').classList.add('busy');
    const level = { c: this.level.c, r: this.level.r, p: Array.from(this.pos), k: this.level.k, f: this.level.f };
    this.ask({ type: 'solve', level, pos: Array.from(this.pos) }, (res) => {
      this.hintBusy = false;
      $('btnHint').classList.remove('busy');
      if (!res.ok || !res.moves || !res.moves[0]) { this.toast('Kein Tipp gefunden.'); return; }
      if (res.moves.length === 0) return;
      const [p, s] = res.moves[0];
      this.hint = { p, s };
      const plug = this.plugs[p], st = this.stage, w = this.socketWorld(s);
      st.hintGlow.position.set(w.x, 0.012, w.z); st.hintGlow.visible = true;
      st.showHintArc(new THREE.Vector3(plug.x, 0, plug.z), w);
      Sound.hint();
      if (res.optimal) this.toast(`Tipp: Von hier aus geht es noch in ${res.moves.length} ${res.moves.length === 1 ? 'Zug' : 'Zügen'}.`, 3200);
      else this.toast('Tipp: Dieser Zug entwirrt am meisten.', 3000);
    });
  }
  clearHint() {
    if (!this.hint) return;
    this.hint = null;
    this.stage.hintGlow.visible = false;
    this.stage.clearHintArc();
    for (const p of this.plugs) p.mesh.userData.bodyMat.emissiveIntensity = 0;
  }

  // ---------- Eingabe ----------
  bindInput() {
    const el = this.stage.renderer.domElement;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => this.onDown(e));
    el.addEventListener('pointermove', (e) => this.onMove(e));
    el.addEventListener('pointerup', (e) => this.onUp(e));
    el.addEventListener('pointercancel', (e) => this.onUp(e, true));
    window.addEventListener('keydown', (e) => {
      if (document.querySelector('.screen.show')) { if (e.key === 'Escape' && this.level) hideScreens(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); this.undo(); }
      else if (e.key === 'r' || e.key === 'R') this.restart();
      else if (e.key === 'h' || e.key === 'H') this.requestHint();
      else if (e.key === 'Escape') showScreen('screenMenu');
    });
  }

  plugAt(cx, cy) {
    let best = null, bd = Infinity;
    for (const pl of this.plugs) {
      const a = this.stage.toScreen(new THREE.Vector3(pl.x, pl.y + 0.15, pl.z));
      const b = this.stage.toScreen(new THREE.Vector3(pl.x, pl.y + PLUG_TOP, pl.z));
      const c = this.stage.toScreen(new THREE.Vector3(pl.x + PLUG_R, pl.y + 0.15, pl.z));
      const rad = Math.max(22, Math.hypot(c.x - a.x, c.y - a.y) * 1.7);
      const d = Math.min(Math.hypot(cx - a.x, cy - a.y), Math.hypot(cx - b.x, cy - b.y));
      if (d < rad && d < bd) { bd = d; best = pl; }
    }
    return best;
  }

  nearestFreeSocket(x, z, plug, maxD) {
    let best = -1, bd = maxD * maxD;
    this.stage.socketWorld.forEach((w, s) => {
      const occ = this.pos.indexOf(s);
      if (occ !== -1 && occ !== plug.p) return;
      const d = (w.x - x) ** 2 + (w.z - z) ** 2;
      if (d < bd) { bd = d; best = s; }
    });
    return best;
  }

  onDown(e) {
    Sound.unlock();
    if (!this.level || this.won) return;
    const pl = this.plugAt(e.clientX, e.clientY);
    if (pl && pl.mode !== 'fly') {
      try { e.target.setPointerCapture(e.pointerId); } catch (err) { /* synthetischer Zeiger */ }
      this.press = { plug: pl, x: e.clientX, y: e.clientY, id: e.pointerId, dragging: false };
      return;
    }
    // Tippen auf ein Loch, wenn ein Stecker gewählt ist
    if (this.selected) {
      const hit = this.stage.rayToPlane(e.clientX, e.clientY, 0);
      const s = hit ? this.nearestFreeSocket(hit.x, hit.z, this.selected, 0.5) : -1;
      const pl2 = this.selected; this.selected = null;
      if (s >= 0) this.commitMove(pl2, s);
      else this.commitMove(pl2, this.pos[pl2.p]);
    }
  }

  onMove(e) {
    const pr = this.press;
    if (!pr || pr.id !== e.pointerId) return;
    if (!pr.dragging && Math.hypot(e.clientX - pr.x, e.clientY - pr.y) > 7) {
      if (pr.plug.locked) { this.pickUp(pr.plug); this.press = null; return; }
      if (this.selected && this.selected !== pr.plug) { this.commitMove(this.selected, this.pos[this.selected.p]); }
      if (this.selected !== pr.plug) this.pickUp(pr.plug);
      this.selected = null;
      pr.dragging = true;
      pr.plug.mode = 'drag';
      this.drag = pr.plug;
    }
    if (pr.dragging) {
      // Zielpunkt auf dem Brett; der Stecker schwebt darüber (bleibt über dem Finger sichtbar)
      const hit = this.stage.rayToPlane(e.clientX, e.clientY, 0);
      if (hit) { pr.plug.tx = hit.x; pr.plug.tz = hit.z; }
    }
  }

  onUp(e, cancel) {
    const pr = this.press;
    if (!pr || pr.id !== e.pointerId) return;
    this.press = null;
    const pl = pr.plug;
    if (pr.dragging) {
      this.drag = null;
      this.stage.dropGlow.visible = false;
      const s = cancel ? -1 : this.nearestFreeSocket(pl.tx, pl.tz, pl, 0.6);
      this.commitMove(pl, s >= 0 ? s : this.pos[pl.p]);
      return;
    }
    // Antippen: auswählen / abwählen
    if (pl.locked) { this.pickUp(pl); return; }
    if (this.selected === pl) { this.selected = null; this.commitMove(pl, this.pos[pl.p]); return; }
    if (this.selected) this.commitMove(this.selected, this.pos[this.selected.p]);
    this.pickUp(pl);
    this.selected = pl;
    pl.mode = 'sel';
  }

  // ---------- Bildschleife ----------
  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now; this.time += dt;
    if (this.level) this.update(dt);
    this.stage.animateMarkers(this.time);
    this.stage.render();
    requestAnimationFrame((t) => this.frame(t));
  }

  update(dt) {
    const st = this.stage;
    // Stecker bewegen
    for (const pl of this.plugs) {
      const k = (r) => 1 - Math.exp(-dt * r);
      if (pl.mode === 'drag') {
        pl.x += (pl.tx - pl.x) * k(28); pl.z += (pl.tz - pl.z) * k(28);
        pl.y += (LIFT - pl.y) * k(14);
      } else if (pl.mode === 'sel') {
        pl.y += (0.38 + 0.04 * Math.sin(this.time * 5) - pl.y) * k(12);
      } else if (pl.mode === 'fly') {
        const d = Math.hypot(pl.tx - pl.x, pl.tz - pl.z);
        pl.x += (pl.tx - pl.x) * k(13); pl.z += (pl.tz - pl.z) * k(13);
        const ty = d > 0.05 ? Math.max(0.3, Math.min(LIFT, d * 0.9)) : 0;
        pl.y += (ty - pl.y) * k(d > 0.05 ? 10 : 18);
        if (d < 0.01 && pl.y < 0.012) {
          pl.x = pl.tx; pl.z = pl.tz; pl.y = 0; pl.mode = 'rest';
          const cb = pl.onLand; pl.onLand = null;
          if (cb) cb();
        }
      } else {
        pl.y += (0 - pl.y) * k(18);
      }
      let sx = 0;
      if (pl.shake > 0) { pl.shake -= dt; sx = Math.sin(pl.shake * 70) * 0.04 * (pl.shake / 0.4); }
      pl.mesh.position.set(pl.x + sx, pl.y, pl.z);
      // Hinweis-Puls
      const bm = pl.mesh.userData.bodyMat;
      if (this.hint && this.hint.p === pl.p) { bm.emissive.setHex(0xffd84a); bm.emissiveIntensity = 0.25 + 0.25 * Math.sin(this.time * 6); }
    }

    // Vorschau beim Ziehen
    let shownPos = this.pos, hideRope = -1;
    if (this.drag) {
      const s = this.nearestFreeSocket(this.drag.tx, this.drag.tz, this.drag, 0.6);
      if (s >= 0) {
        const w = this.socketWorld(s);
        st.dropGlow.position.set(w.x, 0.012, w.z); st.dropGlow.visible = true;
        shownPos = Int16Array.from(this.pos); shownPos[this.drag.p] = s;
      } else { st.dropGlow.visible = false; hideRope = this.drag.rope; }
    }
    const an = (shownPos === this.pos) ? this.analysis : T.analyze(this.board, shownPos);

    // LEDs
    for (const pl of this.plugs) {
      const led = pl.mesh.userData.ledMat;
      const bad = an.tangled[pl.rope] && pl.rope !== hideRope;
      led.emissive.setHex(this.won ? (Math.sin(this.time * 10 + pl.p) > 0 ? 0x80ffb0 : 0x20c060) : bad ? 0xff2a2a : 0x30ff70);
      led.emissiveIntensity = bad ? 1.4 + 0.6 * Math.sin(this.time * 6) : 1.6;
    }

    // Schläuche: Anker, Länge, Physik
    const anchorA = new THREE.Vector3(), anchorB = new THREE.Vector3();
    for (let r = 0; r < this.ropes.length; r++) {
      const a = this.plugs[2 * r], b = this.plugs[2 * r + 1];
      anchorA.set(a.x, a.y + PLUG_TOP, a.z); anchorB.set(b.x, b.y + PLUG_TOP, b.z);
      const rope = this.ropes[r];
      rope.setAnchors(anchorA, anchorB);
      rope.layout();
      rope.updateLength(dt);
    }
    const obstacles = this.pillarObs.slice();
    for (const pl of this.plugs) {
      if (pl.y < 0.15) obstacles.push({ x: pl.x, z: pl.z, r: PLUG_R + 0.01, top: pl.y + PLUG_TOP - 0.02, round: 0.07, owner: this.ropes[pl.rope] });
    }
    const order = this.layers.map((r) => this.ropes[r]);
    for (const rope of order) rope.gatherObstacles(obstacles);
    this.acc += dt;
    let steps = 0;
    while (this.acc >= SUB && steps < 6) {
      for (let k = 0; k < order.length; k++) order[k].step(SUB, order.slice(0, k), null);
      this.acc -= SUB; steps++;
    }
    if (steps === 6) this.acc = 0;
    for (const rope of this.ropes) { rope.sway(dt); rope.updateMesh(); }

    // Konfliktmarker
    const toW = (x, y) => new THREE.Vector3(x - (this.level.c - 1) / 2, 0, y - (this.level.r - 1) / 2);
    const marks = [];
    if (!this.won) {
      an.conflicts.forEach((c, i) => {
        if (c.a === hideRope || c.b === hideRope) return;
        const w = toW(c.x, c.y);
        let top = c.type === 'pillar' ? PILLAR_TOP : 0;
        for (const r of this.ropes) top = Math.max(top, r.topNear(w.x, w.z, 0.2));
        w.y = top + 0.2;
        marks.push({ pos: w, phase: i * 1.3 });
      });
    }
    st.setMarkers(marks);

    // Konfetti
    if (this.confetti) {
      const c = this.confetti, p = c.points.geometry.attributes.position.array, v = c.vel;
      c.t += dt;
      for (let i = 0; i < v.length; i += 3) {
        v[i + 1] -= 7 * dt;
        v[i] *= 0.99; v[i + 2] *= 0.99;
        p[i] += v[i] * dt; p[i + 1] += v[i + 1] * dt; p[i + 2] += v[i + 2] * dt;
        if (p[i + 1] < 0.02) { p[i + 1] = 0.02; v[i + 1] *= -0.3; v[i] *= 0.6; v[i + 2] *= 0.6; }
      }
      c.points.geometry.attributes.position.needsUpdate = true;
      c.points.material.opacity = Math.max(0, 1 - Math.max(0, c.t - 2.2) / 1.2);
      if (c.t > 3.5) { st.scene.remove(c.points); c.points.geometry.dispose(); this.confetti = null; }
    }
  }

  // ---------- Oberfläche ----------
  toast(msg, ms = 2600) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }
  showLoading(on) { $('loading').classList.toggle('show', on); }

  bindUI() {
    $('btnUndo').onclick = () => this.undo();
    $('btnRestart').onclick = () => this.restart();
    $('btnHint').onclick = () => this.requestHint();
    $('btnMenu').onclick = () => showScreen('screenMenu');
    $('btnHelp').onclick = () => showScreen('screenHelp');
    $('mPlay').onclick = () => { const i = Math.min(nextLevel(), LEVELS.length - 1); this.loadLevel(i); hideScreens(); };
    $('mLevels').onclick = () => { renderLevels(this); showScreen('screenLevels'); };
    $('mRandom').onclick = () => showScreen('screenRandom');
    $('mHelp').onclick = () => showScreen('screenHelp');
    $('mSound').onclick = () => { store.sound = !store.sound; save(); Sound.setEnabled(store.sound); updateSoundBtn(); };
    document.querySelectorAll('[data-back]').forEach((b) => { b.onclick = () => (b.dataset.back ? showScreen(b.dataset.back) : hideScreens()); });
    document.querySelectorAll('[data-random]').forEach((b) => { b.onclick = () => this.loadRandom(b.dataset.random); });
    $('wRetry').onclick = () => { hideWin(); this.restart(); };
    $('wNext').onclick = () => {
      hideWin();
      if (this.mode === 'random') this.loadRandom(this.randomKey);
      else if (this.levelIndex + 1 < LEVELS.length) this.loadLevel(this.levelIndex + 1);
      else { renderLevels(this); showScreen('screenLevels'); }
    };
    $('wMenu').onclick = () => { hideWin(); showScreen('screenMenu'); };
    updateSoundBtn();
  }
}

function nextLevel() {
  for (let i = 0; i < LEVELS.length; i++) if (store.best[i] === undefined) return i;
  return store.last || 0;
}
function updateSoundBtn() { $('mSound').textContent = store.sound ? 'Ton: an' : 'Ton: aus'; }

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('show', s.id === id));
  if (id === 'screenMenu') {
    const i = nextLevel();
    $('mPlay').textContent = maxSolved() < 0 ? 'Spielen' : (i < LEVELS.length ? `Weiter mit Level ${i + 1}` : 'Spielen');
    $('mProgress').textContent = progressText();
    $('mResume').style.display = game.started ? '' : 'none';
  }
}
function hideScreens() {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
  if (game) game.started = true;
}

function progressText() {
  let solved = 0, st = 0;
  LEVELS.forEach((lv, i) => { if (store.best[i] !== undefined) { solved++; st += stars(store.best[i], lv.par); } });
  return `${solved} / ${LEVELS.length} Level gelöst · ${st} / ${LEVELS.length * 3} Sterne`;
}

function starHtml(n) { return [0, 1, 2].map((k) => `<span class="star${k < n ? ' on' : ''}">★</span>`).join(''); }

function renderLevels(g) {
  const root = $('levelGrid');
  root.innerHTML = '';
  for (const ch of CHAPTERS) {
    if (ch.from >= LEVELS.length) continue;
    const h = document.createElement('h3'); h.textContent = ch.name; root.appendChild(h);
    const grid = document.createElement('div'); grid.className = 'grid';
    for (let i = ch.from; i <= Math.min(ch.to, LEVELS.length - 1); i++) {
      const b = document.createElement('button');
      const best = store.best[i];
      b.className = 'lvl' + (best !== undefined ? ' done' : '') + (unlocked(i) ? '' : ' locked');
      b.innerHTML = `<span class="n">${i + 1}</span><span class="s">${best !== undefined ? starHtml(stars(best, LEVELS[i].par)) : unlocked(i) ? '' : '&#128274;'}</span>`;
      b.disabled = !unlocked(i);
      b.onclick = () => { g.loadLevel(i); hideScreens(); };
      grid.appendChild(b);
    }
    root.appendChild(grid);
  }
  $('lvProgress').textContent = progressText();
}

function showWin(g, st, isBest) {
  $('wStars').innerHTML = starHtml(st);
  $('wTitle').textContent = st === 3 ? (g.moves < g.level.par ? 'Besser als das Optimum?!' : 'Perfekt entwirrt!') : 'Entwirrt!';
  $('wText').textContent = `${g.moves} ${g.moves === 1 ? 'Zug' : 'Züge'} · Optimum ${g.level.par}` +
    (st < 3 ? ` – mit ${g.level.par} ${g.level.par === 1 ? 'Zug' : 'Zügen'} gibt es drei Sterne.` : '') + (isBest ? ' · Neuer Bestwert!' : '');
  $('wNext').textContent = g.mode === 'random' ? 'Neues Rätsel' : (g.levelIndex + 1 < LEVELS.length ? 'Nächstes Level' : 'Levelübersicht');
  $('winModal').classList.add('show');
}
function hideWin() { $('winModal').classList.remove('show'); }

// ---------- Start ----------
let game;
try {
  game = new Game();
  window.game = game;
  game.loadLevel(Math.min(store.last !== undefined ? store.last : 0, LEVELS.length - 1));
  showScreen('screenMenu');
  $('mResume').onclick = () => hideScreens();
} catch (err) {
  console.error(err);
  $('fatal').classList.add('show');
  $('fatalMsg').textContent = String(err && err.message || err);
}
