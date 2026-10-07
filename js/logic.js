/* Entwirren — Spiellogik (Geometrie, Konfliktregeln, optimaler Solver, Levelgenerator).
 * Klassisches Script: läuft im Browser (window.Tangle), im Worker (importScripts) und in Node (require).
 *
 * Koordinaten: Steckplätze liegen auf einem Gitter (x = Spalte, y = Zeile), Abstand 1.
 * Ein Schlauch verbindet zwei Stecker; logisch ist er die Strecke zwischen ihren Steckplätzen.
 * Zwei Schläuche sind verheddert, wenn sich ihre Strecken schneiden oder einer zu nah über
 * den Stecker des anderen läuft. Ein Schlauch über einer Säule ist ebenfalls verheddert.
 */
(function (root) {
  'use strict';
  const T = {};

  T.ROPE_R = 0.07;       // Schlauchradius (Weltmaß = Gitterabstand 1)
  T.PLUG_R = 0.15;       // Steckerradius
  T.PILLAR_R = 0.14;     // Säulenradius
  T.PLUG_CLEAR = 0.24;   // Schlauch näher als das an fremdem Stecker -> verheddert
  T.PILLAR_CLEAR = 0.235;

  // ---------- Zufall ----------
  T.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  function shuffle(arr, rnd) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // ---------- Geometrie ----------
  function orient(ax, ay, bx, by, cx, cy) {
    const v = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    return v > 1e-9 ? 1 : v < -1e-9 ? -1 : 0;
  }
  function onSeg(ax, ay, bx, by, px, py) {
    return Math.min(ax, bx) - 1e-9 <= px && px <= Math.max(ax, bx) + 1e-9 &&
           Math.min(ay, by) - 1e-9 <= py && py <= Math.max(ay, by) + 1e-9;
  }
  function segIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
    const o1 = orient(ax, ay, bx, by, cx, cy), o2 = orient(ax, ay, bx, by, dx, dy);
    const o3 = orient(cx, cy, dx, dy, ax, ay), o4 = orient(cx, cy, dx, dy, bx, by);
    if (o1 !== o2 && o3 !== o4) return true;
    if (o1 === 0 && onSeg(ax, ay, bx, by, cx, cy)) return true;
    if (o2 === 0 && onSeg(ax, ay, bx, by, dx, dy)) return true;
    if (o3 === 0 && onSeg(cx, cy, dx, dy, ax, ay)) return true;
    if (o4 === 0 && onSeg(cx, cy, dx, dy, bx, by)) return true;
    return false;
  }
  function closestT(px, py, ax, ay, bx, by) {
    const vx = bx - ax, vy = by - ay;
    const l2 = vx * vx + vy * vy;
    if (l2 < 1e-12) return 0;
    let t = ((px - ax) * vx + (py - ay) * vy) / l2;
    return t < 0 ? 0 : t > 1 ? 1 : t;
  }
  function ptSegDist2(px, py, ax, ay, bx, by) {
    const t = closestT(px, py, ax, ay, bx, by);
    const qx = ax + (bx - ax) * t - px, qy = ay + (by - ay) * t - py;
    return qx * qx + qy * qy;
  }
  T.segIntersect = segIntersect;
  T.closestT = closestT;
  T.ptSegDist2 = ptSegDist2;

  // ---------- Brett ----------
  // level: {c, r, p:[socket je Stecker], k:[[x,y] Säulen-Zelle], f:[gesperrte Stecker], l:[Lagen], par}
  T.makeBoard = function (level) {
    const cols = level.c, rows = level.r, S = cols * rows, N = level.p.length >> 1;
    const sx = new Float64Array(S), sy = new Float64Array(S);
    for (let i = 0; i < S; i++) { sx[i] = i % cols; sy[i] = Math.floor(i / cols); }
    const pillars = (level.k || []).map(([x, y]) => ({ x: x + 0.5, y: y + 0.5 }));
    const locked = new Uint8Array(2 * N);
    (level.f || []).forEach((p) => { locked[p] = 1; });
    return { cols, rows, S, N, sx, sy, pillars, locked };
  };

  // Konflikt zwischen Schlauch i und j bei Steckerpositionen pos
  function ropeConflict(b, pos, i, j) {
    const sx = b.sx, sy = b.sy;
    const a0 = pos[2 * i], a1 = pos[2 * i + 1], c0 = pos[2 * j], c1 = pos[2 * j + 1];
    const ax = sx[a0], ay = sy[a0], bx = sx[a1], by = sy[a1];
    const cx = sx[c0], cy = sy[c0], dx = sx[c1], dy = sy[c1];
    if (segIntersect(ax, ay, bx, by, cx, cy, dx, dy)) return true;
    const c2 = T.PLUG_CLEAR * T.PLUG_CLEAR;
    return ptSegDist2(cx, cy, ax, ay, bx, by) < c2 || ptSegDist2(dx, dy, ax, ay, bx, by) < c2 ||
           ptSegDist2(ax, ay, cx, cy, dx, dy) < c2 || ptSegDist2(bx, by, cx, cy, dx, dy) < c2;
  }
  function ropePillar(b, pos, i) {
    if (!b.pillars.length) return false;
    const a0 = pos[2 * i], a1 = pos[2 * i + 1];
    const ax = b.sx[a0], ay = b.sy[a0], bx = b.sx[a1], by = b.sy[a1];
    const c2 = T.PILLAR_CLEAR * T.PILLAR_CLEAR;
    for (const p of b.pillars) if (ptSegDist2(p.x, p.y, ax, ay, bx, by) < c2) return true;
    return false;
  }
  T.ropeConflict = ropeConflict;
  T.ropePillar = ropePillar;

  // Ausführliche Analyse für die Darstellung: Konfliktpunkte + verhedderte Schläuche
  T.analyze = function (b, pos) {
    const N = b.N, sx = b.sx, sy = b.sy;
    const tangled = new Uint8Array(N), conflicts = [];
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        if (!ropeConflict(b, pos, i, j)) continue;
        tangled[i] = tangled[j] = 1;
        const a0 = pos[2 * i], a1 = pos[2 * i + 1], c0 = pos[2 * j], c1 = pos[2 * j + 1];
        const ax = sx[a0], ay = sy[a0], bx = sx[a1], by = sy[a1];
        const cx = sx[c0], cy = sy[c0], dx = sx[c1], dy = sy[c1];
        // Schnittpunkt der Geraden, falls echt; sonst nächster Punkt zum Stecker
        const den = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
        let x, y;
        if (Math.abs(den) > 1e-9 && segIntersect(ax, ay, bx, by, cx, cy, dx, dy)) {
          const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / den;
          x = ax + (bx - ax) * t; y = ay + (by - ay) * t;
        } else {
          let best = Infinity;
          const cand = [[cx, cy, ax, ay, bx, by], [dx, dy, ax, ay, bx, by], [ax, ay, cx, cy, dx, dy], [bx, by, cx, cy, dx, dy]];
          for (const q of cand) {
            const d = ptSegDist2(q[0], q[1], q[2], q[3], q[4], q[5]);
            if (d < best) {
              best = d;
              const t = closestT(q[0], q[1], q[2], q[3], q[4], q[5]);
              x = (q[0] + q[2] + (q[4] - q[2]) * t) / 2; y = (q[1] + q[3] + (q[5] - q[3]) * t) / 2;
            }
          }
        }
        conflicts.push({ type: 'rope', a: i, b: j, x, y });
      }
      if (b.pillars.length) {
        const a0 = pos[2 * i], a1 = pos[2 * i + 1];
        for (const p of b.pillars) {
          if (ptSegDist2(p.x, p.y, sx[a0], sy[a0], sx[a1], sy[a1]) < T.PILLAR_CLEAR * T.PILLAR_CLEAR) {
            tangled[i] = 1;
            conflicts.push({ type: 'pillar', a: i, b: -1, x: p.x, y: p.y });
          }
        }
      }
    }
    let count = 0;
    for (let i = 0; i < N; i++) count += tangled[i];
    return { tangled, conflicts, tangledCount: count, solved: conflicts.length === 0 };
  };

  // ---------- Heuristik: minimale Knotenüberdeckung des Konfliktgraphen ----------
  // Jeder Konflikt (i,j) verschwindet nur, wenn i oder j bewegt wird -> untere Schranke, konsistent.
  function popcnt(x) { x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24; }
  function vcFits(adj, N, alive, k) {
    let best = -1, bd = 0, edges2 = 0;
    for (let v = 0; v < N; v++) {
      if (!(alive & (1 << v))) continue;
      const d = popcnt(adj[v] & alive);
      edges2 += d;
      if (d > bd) { bd = d; best = v; }
    }
    if (bd === 0) return true;
    if (k <= 0) return false;
    if (bd * k * 2 < edges2) return false;              // k Knoten mit Grad <= bd decken höchstens k*bd Kanten
    if (vcFits(adj, N, alive & ~(1 << best), k - 1)) return true;
    if (bd > 1 && bd <= k) {                             // best nicht nehmen -> alle Nachbarn nehmen
      const nb = adj[best] & alive;
      if (vcFits(adj, N, alive & ~nb & ~(1 << best), k - bd)) return true;
    }
    return false;
  }
  function minCover(adj, N, forced) {
    const alive = ((1 << N) - 1) & ~forced;
    const base = popcnt(forced);
    for (let k = 0; k <= N; k++) if (vcFits(adj, N, alive, k)) return base + k;
    return base + N;
  }
  T.minCover = minCover;

  // ---------- Optimaler Solver (IDA*) ----------
  // Ein Zug = ein Stecker auf einen freien Steckplatz. Liefert [[stecker, ziel], ...] oder null.
  T.solve = function (b, pos0, opts) {
    opts = opts || {};
    const maxDepth = opts.maxDepth || 14, budget = opts.budget || 4e6;
    const N = b.N, S = b.S, P = 2 * N, locked = b.locked;
    const pos = Int16Array.from(pos0);
    const occ = new Int16Array(S).fill(-1);
    for (let p = 0; p < P; p++) occ[pos[p]] = p;
    const adj = new Int32Array(N);
    let forced = 0;
    for (let i = 0; i < N; i++) {
      if (ropePillar(b, pos, i)) forced |= 1 << i;
      for (let j = i + 1; j < N; j++) if (ropeConflict(b, pos, i, j)) { adj[i] |= 1 << j; adj[j] |= 1 << i; }
    }
    function updateRope(r) {
      const old = adj[r];
      let row = 0;
      for (let j = 0; j < N; j++) if (j !== r && ropeConflict(b, pos, r, j)) row |= 1 << j;
      const changed = old ^ row;
      for (let j = 0; j < N; j++) if (changed & (1 << j)) adj[j] ^= 1 << r;
      adj[r] = row;
      if (ropePillar(b, pos, r)) forced |= 1 << r; else forced &= ~(1 << r);
    }
    let nodes = 0;
    const path = [];
    const FOUND = -1;
    function dfs(g, bound, lastP, lastFrom) {
      const h = minCover(adj, N, forced);
      if (h === 0) return FOUND;
      const f = g + h;
      if (f > bound) return f;
      if (++nodes > budget) throw new Error('budget');
      let min = Infinity;
      for (let p = 0; p < P; p++) {
        if (locked[p] || p === lastP) continue;
        const r = p >> 1, from = pos[p];
        for (let s = 0; s < S; s++) {
          if (occ[s] !== -1) continue;
          // Vertauschbare Zugpaare nur in einer Reihenfolge probieren
          if (lastP >= 0 && p < lastP && s !== lastFrom) continue;
          const oldAdj = adj[r], oldForced = forced;
          occ[from] = -1; occ[s] = p; pos[p] = s;
          updateRope(r);
          path.push([p, s]);
          const t = dfs(g + 1, bound, p, from);
          if (t === FOUND) return FOUND;
          path.pop();
          pos[p] = from; occ[s] = -1; occ[from] = p;
          // Konfliktzeile zurücksetzen
          const changed = adj[r] ^ oldAdj;
          for (let j = 0; j < N; j++) if (changed & (1 << j)) adj[j] ^= 1 << r;
          adj[r] = oldAdj; forced = oldForced;
          if (t < min) min = t;
        }
      }
      return min;
    }
    let bound = minCover(adj, N, forced);
    if (bound === 0) return { moves: [], nodes: 0 };
    try {
      while (bound <= maxDepth) {
        const t = dfs(0, bound, -1, -1);
        if (t === FOUND) return { moves: path.slice(), nodes };
        if (t === Infinity) return null;
        bound = t;
      }
    } catch (e) {
      if (e.message !== 'budget') throw e;
    }
    return null;
  };

  // Gieriger Tipp, falls der Solver das Budget sprengt: Zug, der die Schranke am stärksten senkt
  T.greedyMove = function (b, pos0) {
    const N = b.N, S = b.S, P = 2 * N;
    const pos = Int16Array.from(pos0);
    const occ = new Int16Array(S).fill(-1);
    for (let p = 0; p < P; p++) occ[pos[p]] = p;
    function score() {
      const adj = new Int32Array(N); let forced = 0, edges = 0;
      for (let i = 0; i < N; i++) {
        if (ropePillar(b, pos, i)) forced |= 1 << i;
        for (let j = i + 1; j < N; j++) if (ropeConflict(b, pos, i, j)) { adj[i] |= 1 << j; adj[j] |= 1 << i; edges++; }
      }
      return minCover(adj, N, forced) * 100 + edges;
    }
    let best = null, bs = Infinity;
    for (let p = 0; p < P; p++) {
      if (b.locked[p]) continue;
      const from = pos[p];
      for (let s = 0; s < S; s++) {
        if (occ[s] !== -1) continue;
        pos[p] = s;
        const sc = score();
        if (sc < bs) { bs = sc; best = [p, s]; }
        pos[p] = from;
      }
    }
    return best;
  };

  // ---------- Generator ----------
  // params: {c, r, n, pillars, locks, parMin, parMax, scramble, budget}
  T.generate = function (params, seed) {
    const rnd = T.rng(seed);
    const cols = params.c, rows = params.r, S = cols * rows, N = params.n;
    for (let attempt = 0; attempt < (params.attempts || 400); attempt++) {
      // Säulen in zufälligen Zellen
      const cells = [];
      for (let y = 0; y < rows - 1; y++) for (let x = 0; x < cols - 1; x++) cells.push([x, y]);
      shuffle(cells, rnd);
      const k = cells.slice(0, params.pillars || 0);
      const proto = { c: cols, r: rows, p: new Array(2 * N).fill(0), k, f: [] };
      const b = T.makeBoard(proto);

      // 1) Entwirrten Zustand bauen
      const pos = new Int16Array(2 * N);
      const free = shuffle([...Array(S).keys()], rnd);
      let ok = true;
      for (let i = 0; i < N && ok; i++) {
        let placed = false;
        for (let tries = 0; tries < 300 && !placed; tries++) {
          const avail = free.filter((s) => !Array.prototype.includes.call(pos.subarray(0, 2 * i), s));
          const s0 = avail[Math.floor(rnd() * avail.length)];
          const s1 = avail[Math.floor(rnd() * avail.length)];
          if (s0 === s1) continue;
          const dx = b.sx[s0] - b.sx[s1], dy = b.sy[s0] - b.sy[s1];
          const len = Math.hypot(dx, dy);
          if (len > (params.maxLen || 4.3)) continue;
          pos[2 * i] = s0; pos[2 * i + 1] = s1;
          let clash = ropePillar(b, pos, i);
          for (let j = 0; j < i && !clash; j++) clash = ropeConflict(b, pos, i, j);
          if (!clash) placed = true;
        }
        if (!placed) ok = false;
      }
      if (!ok) continue;

      // 2) Sperren: höchstens ein Stecker pro Schlauch
      const lockedPlugs = shuffle([...Array(N).keys()], rnd).slice(0, params.locks || 0).map((r) => 2 * r + (rnd() < 0.5 ? 0 : 1));
      proto.f = lockedPlugs;
      const bl = T.makeBoard(proto);

      // 3) Verwürfeln: zufällige Züge, bevorzugt solche, die neue Konflikte erzeugen
      const layers = shuffle([...Array(N).keys()], rnd);
      const occ = new Int16Array(S).fill(-1);
      for (let p = 0; p < 2 * N; p++) occ[pos[p]] = p;
      const moves = params.scramble || (params.parMax + 2);
      let lastP = -1;
      for (let m = 0; m < moves; m++) {
        let best = null, bestScore = -Infinity;
        for (let c = 0; c < 24; c++) {
          const p = Math.floor(rnd() * 2 * N);
          if (bl.locked[p] || p === lastP) continue;
          const s = Math.floor(rnd() * S);
          if (occ[s] !== -1) continue;
          const from = pos[p];
          pos[p] = s;
          const a = T.analyze(bl, pos);
          const score = a.conflicts.length + rnd() * 1.5;
          pos[p] = from;
          if (score > bestScore) { bestScore = score; best = [p, s]; }
        }
        if (!best) continue;
        const [p, s] = best;
        occ[pos[p]] = -1; occ[s] = p; pos[p] = s; lastP = p;
        const r = p >> 1;
        layers.splice(layers.indexOf(r), 1); layers.push(r);
      }
      const a = T.analyze(bl, pos);
      if (a.tangledCount < Math.min(N, params.minTangled || Math.ceil(N * 0.6))) continue;

      // 4) Optimum bestimmen
      const sol = T.solve(bl, pos, { maxDepth: params.parMax, budget: params.budget || 3e6 });
      if (!sol) continue;
      const par = sol.moves.length;
      if (par < params.parMin || par > params.parMax) continue;
      if (params.extra) {
        const adj = new Int32Array(N); let forced = 0;
        for (const c of a.conflicts) { if (c.type === 'pillar') forced |= 1 << c.a; else { adj[c.a] |= 1 << c.b; adj[c.b] |= 1 << c.a; } }
        if (par - minCover(adj, N, forced) < params.extra) continue;
      }
      return { c: cols, r: rows, p: Array.from(pos), k, f: lockedPlugs, l: layers, par, sol: sol.moves };
    }
    return null;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = T;
  else root.Tangle = T;
})(typeof self !== 'undefined' ? self : this);
