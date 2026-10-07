// Schlauchphysik + Röhrengeometrie.
//
// Modell: Der Grundriss eines Schlauchs folgt der Geraden zwischen seinen Steckern
// (so bleibt die Topologie exakt gleich der Spiellogik). Die Höhe jedes Partikels wird
// per Verlet simuliert: Schwerkraft, Längenbegrenzung, Biegesteifigkeit, Brett, fremde
// Stecker, Säulen und die Schläuche darunter (Lagenreihenfolge). Darüber liegt ein
// gedämpftes Feder-Nachschwingen im Grundriss, damit gezogene Schläuche träge pendeln.
import * as THREE from 'three';

export const ROPE_R = 0.07;
export const PLUG_TOP = 0.31;     // Höhe, an der der Schlauch aus dem Stecker kommt
const N = 72;                     // Partikel je Schlauch
const RAD = 12;                   // Segmente im Röhrenquerschnitt
const GRAV = 10;
const ITER = 8;

let ribTexture = null;
function ribs() {
  if (ribTexture) return ribTexture;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 4;
  const g = c.getContext('2d');
  for (let x = 0; x < 64; x++) {
    const v = Math.round(128 + 110 * Math.sin((x / 64) * Math.PI * 2));
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(x, 0, 1, 4);
  }
  ribTexture = new THREE.CanvasTexture(c);
  ribTexture.wrapS = ribTexture.wrapT = THREE.RepeatWrapping;
  return ribTexture;
}

export class Rope {
  constructor(color) {
    this.n = N;
    this.y = new Float32Array(N);      // Höhe
    this.py = new Float32Array(N);     // vorige Höhe (Verlet)
    this.tx = new Float32Array(N);     // Grundriss-Ziel
    this.tz = new Float32Array(N);
    this.sx = new Float32Array(N);     // sichtbarer Grundriss (mit Nachschwingen)
    this.sz = new Float32Array(N);
    this.vx = new Float32Array(N);
    this.vz = new Float32Array(N);
    this.A = new THREE.Vector3(); this.B = new THREE.Vector3();
    this.L = 1; this.inited = false;
    this.obst = [];

    const verts = N * (RAD + 1);
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(verts * 3);
    this.nor = new Float32Array(verts * 3);
    this.uv = new Float32Array(verts * 2);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < N - 1; i++) {
      for (let j = 0; j < RAD; j++) {
        const a = i * (RAD + 1) + j, b = a + RAD + 1;
        idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    geo.setIndex(idx);
    this.material = new THREE.MeshPhysicalMaterial({
      color, roughness: 0.38, metalness: 0.0,
      clearcoat: 0.7, clearcoatRoughness: 0.28,
      bumpMap: ribs(), bumpScale: 0.9,
      emissive: new THREE.Color(color), emissiveIntensity: 0,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
  }

  dispose() { this.mesh.geometry.dispose(); this.material.dispose(); }

  setAnchors(a, b) { this.A.copy(a); this.B.copy(b); }

  // Grundriss-Ziel entlang der Geraden
  layout() {
    const A = this.A, B = this.B;
    for (let i = 0; i < N; i++) {
      const s = i / (N - 1);
      this.tx[i] = A.x + (B.x - A.x) * s;
      this.tz[i] = A.z + (B.z - A.z) * s;
    }
    if (!this.inited) {
      for (let i = 0; i < N; i++) {
        this.sx[i] = this.tx[i]; this.sz[i] = this.tz[i];
        const s = i / (N - 1);
        this.y[i] = this.py[i] = 1.2 + 0.4 * Math.sin(Math.PI * s) + Math.random() * 0.05;
      }
      this.inited = true;
    }
  }

  horizLen() { return Math.hypot(this.B.x - this.A.x, this.B.z - this.A.z); }

  updateLength(dt) {
    const lift = Math.max(0, Math.max(this.A.y, this.B.y) - PLUG_TOP);
    const target = this.horizLen() * 1.04 + 0.55 + lift * 0.7;
    if (!this.lenInit) { this.L = target; this.lenInit = true; }
    this.L += (target - this.L) * Math.min(1, dt * 5);
  }

  heightAt(t) {
    const f = Math.min(N - 1, Math.max(0, t * (N - 1)));
    const i = Math.min(N - 2, Math.floor(f)), u = f - i;
    return this.y[i] * (1 - u) + this.y[i + 1] * u;
  }

  // Hindernisse vorfiltern: nur was nahe der Geraden liegt
  gatherObstacles(all) {
    const o = this.obst; o.length = 0;
    const ax = this.A.x, az = this.A.z, bx = this.B.x, bz = this.B.z;
    const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1e-9;
    for (const ob of all) {
      if (ob.owner === this) continue;
      let t = ((ob.x - ax) * vx + (ob.z - az) * vz) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = ax + vx * t - ob.x, dz = az + vz * t - ob.z;
      if (dx * dx + dz * dz < (ob.r + ROPE_R) * (ob.r + ROPE_R)) o.push(ob);
    }
  }

  step(dt, below, wave) {
    const y = this.y, py = this.py, tx = this.tx, tz = this.tz;
    const g = GRAV * dt * dt;
    for (let i = 1; i < N - 1; i++) {
      const v = (y[i] - py[i]) * 0.99;
      py[i] = y[i];
      y[i] += v - g + (wave ? wave[i] : 0);
    }
    const h = this.horizLen() / (N - 1);
    const seg = this.L / (N - 1);
    const maxDy = Math.sqrt(Math.max(seg * seg - h * h, 0));
    const R2 = 4 * ROPE_R * ROPE_R;

    // Kandidaten unter diesem Schlauch (Grundriss-Abstand der Geraden)
    const cands = [];
    for (const r of below) if (segSegDist2(this.A, this.B, r.A, r.B) < R2 * 1.05) cands.push(r);

    for (let it = 0; it < ITER; it++) {
      y[0] = this.A.y; y[N - 1] = this.B.y;
      // Längenbegrenzung (nur in der Höhe, Grundriss ist fest)
      for (let i = 0; i < N - 1; i++) {
        const d = y[i + 1] - y[i], ad = Math.abs(d);
        if (ad <= maxDy) continue;
        const ex = (ad - maxDy) * Math.sign(d);
        if (i === 0) y[1] -= ex;
        else if (i + 1 === N - 1) y[i] += ex;
        else { y[i] += ex * 0.5; y[i + 1] -= ex * 0.5; }
      }
      // Biegesteifigkeit
      for (let i = 1; i < N - 1; i++) y[i] += ((y[i - 1] + y[i + 1]) * 0.5 - y[i]) * 0.12;
      // Kontakte
      for (let i = 2; i < N - 2; i++) {
        let req = ROPE_R;
        const x = tx[i], z = tz[i];
        for (const ob of this.obst) {
          const dx = x - ob.x, dz = z - ob.z;
          const rr = ob.r + ROPE_R, d2 = dx * dx + dz * dz;
          if (d2 < rr * rr) {
            const q = Math.sqrt(d2) / rr;
            const top = ob.top + ROPE_R - ob.round * q * q;
            if (top > req) req = top;
          }
        }
        for (const r of cands) {
          const ax = r.A.x, az = r.A.z, vx = r.B.x - ax, vz = r.B.z - az;
          const l2 = vx * vx + vz * vz || 1e-9;
          let t = ((x - ax) * vx + (z - az) * vz) / l2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const dx = ax + vx * t - x, dz = az + vz * t - z;
          const d2 = dx * dx + dz * dz;
          if (d2 < R2) {
            const top = r.heightAt(t) + Math.sqrt(R2 - d2);
            if (top > req) req = top;
          }
        }
        if (y[i] < req) {
          // Reibung: beim Aufsetzen Geschwindigkeit dämpfen
          y[i] = req;
          py[i] += (y[i] - py[i]) * 0.3;
        }
      }
    }
  }

  // Grundriss-Nachschwingen (Feder-Dämpfer gegen die Gerade)
  sway(dt) {
    for (let i = 0; i < N; i++) {
      if (i === 0 || i === N - 1 || !this.swayInit) {
        this.sx[i] = this.tx[i]; this.sz[i] = this.tz[i]; this.vx[i] = this.vz[i] = 0;
        continue;
      }
      const s = i / (N - 1), w = Math.sin(Math.PI * s);
      const k = 700 - 520 * w, c = 2 * Math.sqrt(k) * 0.55;
      this.vx[i] += (k * (this.tx[i] - this.sx[i]) - c * this.vx[i]) * dt;
      this.vz[i] += (k * (this.tz[i] - this.sz[i]) - c * this.vz[i]) * dt;
      this.sx[i] += this.vx[i] * dt;
      this.sz[i] += this.vz[i] * dt;
      const ox = this.sx[i] - this.tx[i], oz = this.sz[i] - this.tz[i];
      const o = Math.hypot(ox, oz), lim = 0.3 * w + 0.02;
      if (o > lim) { this.sx[i] = this.tx[i] + ox / o * lim; this.sz[i] = this.tz[i] + oz / o * lim; }
    }
    this.swayInit = true;
  }

  updateMesh() {
    const P = this.pos, Nn = this.nor, U = this.uv;
    const sx = this.sx, sz = this.sz, y = this.y;
    let nx = 0, ny = 1, nz = 0, arc = 0;
    for (let i = 0; i < N; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(N - 1, i + 1);
      let tX = sx[i1] - sx[i0], tY = y[i1] - y[i0], tZ = sz[i1] - sz[i0];
      const tl = Math.hypot(tX, tY, tZ) || 1;
      tX /= tl; tY /= tl; tZ /= tl;
      if (i === 0) {
        // Start-Normale: senkrecht zur Tangente, möglichst horizontal
        nx = -tZ; ny = 0; nz = tX;
        if (Math.hypot(nx, nz) < 1e-3) { nx = 1; nz = 0; }
      }
      // Paralleltransport
      const dp = nx * tX + ny * tY + nz * tZ;
      nx -= tX * dp; ny -= tY * dp; nz -= tZ * dp;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      const bx = tY * nz - tZ * ny, by = tZ * nx - tX * nz, bz = tX * ny - tY * nx;
      if (i > 0) arc += Math.hypot(sx[i] - sx[i - 1], y[i] - y[i - 1], sz[i] - sz[i - 1]);
      // Enden etwas schlanker, damit sie in der Tülle verschwinden
      const r = ROPE_R * (i === 0 || i === N - 1 ? 0.85 : 1);
      for (let j = 0; j <= RAD; j++) {
        const a = (j / RAD) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const ox = nx * ca + bx * sa, oy = ny * ca + by * sa, oz = nz * ca + bz * sa;
        const k = (i * (RAD + 1) + j);
        P[k * 3] = sx[i] + ox * r; P[k * 3 + 1] = y[i] + oy * r; P[k * 3 + 2] = sz[i] + oz * r;
        Nn[k * 3] = ox; Nn[k * 3 + 1] = oy; Nn[k * 3 + 2] = oz;
        U[k * 2] = arc / 0.075; U[k * 2 + 1] = j / RAD;
      }
    }
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.normal.needsUpdate = true;
    g.attributes.uv.needsUpdate = true;
  }

  // Höchster Punkt in der Nähe eines Grundrisspunkts (für Marker)
  topNear(x, z, rad) {
    let m = 0;
    for (let i = 0; i < N; i++) {
      const dx = this.tx[i] - x, dz = this.tz[i] - z;
      if (dx * dx + dz * dz < rad * rad && this.y[i] > m) m = this.y[i];
    }
    return m;
  }
}

function segSegDist2(a, b, c, d) {
  // Abstand zweier Strecken im Grundriss (x,z)
  const cross = (ox, oz, px, pz, qx, qz) => (px - ox) * (qz - oz) - (pz - oz) * (qx - ox);
  const d1 = cross(a.x, a.z, b.x, b.z, c.x, c.z), d2 = cross(a.x, a.z, b.x, b.z, d.x, d.z);
  const d3 = cross(c.x, c.z, d.x, d.z, a.x, a.z), d4 = cross(c.x, c.z, d.x, d.z, b.x, b.z);
  if (((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0))) return 0;
  return Math.min(ps2(c, a, b), ps2(d, a, b), ps2(a, c, d), ps2(b, c, d));
}
function ps2(p, a, b) {
  const vx = b.x - a.x, vz = b.z - a.z, l2 = vx * vx + vz * vz || 1e-9;
  let t = ((p.x - a.x) * vx + (p.z - a.z) * vz) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = a.x + vx * t - p.x, dz = a.z + vz * t - p.z;
  return dx * dx + dz * dz;
}
