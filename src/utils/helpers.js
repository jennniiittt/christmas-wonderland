import * as THREE from 'three';

/** Deterministic PRNG so the tree looks the same on every visit. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Small 2D value noise + fbm (CPU side, for terrain). */
export function createNoise2D(seed = 1) {
  const rnd = mulberry32(seed);
  const perm = new Uint8Array(512);
  const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    perm[i] = i;
    vals[i] = rnd();
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const v = (x, y) => vals[perm[(x & 255) + perm[y & 255]]];
  const noise = (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const w = yf * yf * (3 - 2 * yf);
    const a = v(xi, yi);
    const b = v(xi + 1, yi);
    const c = v(xi, yi + 1);
    const d = v(xi + 1, yi + 1);
    return lerp(lerp(a, b, u), lerp(c, d, u), w);
  };
  noise.fbm = (x, y, oct = 4) => {
    let s = 0;
    let amp = 0.5;
    let f = 1;
    for (let i = 0; i < oct; i++) {
      s += amp * noise(x * f, y * f);
      f *= 2.03;
      amp *= 0.5;
    }
    return s;
  };
  return noise;
}

export function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

export function canvasTexture(canvas, { srgb = true, repeat = null, anisotropy = 4 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  t.anisotropy = anisotropy;
  return t;
}

let glowTex = null;
/** Soft radial glow used by halos, lamps and the star. */
export function glowTexture() {
  if (glowTex) return glowTex;
  const [c, ctx] = makeCanvas(128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.12, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.28)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.07)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  glowTex = canvasTexture(c, { srgb: false });
  return glowTex;
}

export function glowSprite(color, scale = 1, opacity = 1) {
  const mat = new THREE.SpriteMaterial({
    map: glowTexture(),
    color: new THREE.Color(color),
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(scale);
  return s;
}

let blobTex = null;
/** Contact shadow texture. */
export function blobShadowTexture() {
  if (blobTex) return blobTex;
  const [c, ctx] = makeCanvas(128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.75)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.35)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  blobTex = canvasTexture(c, { srgb: false });
  return blobTex;
}

export function blobShadow(size, opacity = 0.6) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, opacity, depthWrite: false, color: 0x0a1020 })
  );
  m.rotation.x = -Math.PI / 2;
  m.scale.set(size, size, 1);
  m.renderOrder = 1;
  return m;
}

/**
 * Build a flat ribbon strip along a list of points. `widthDirs` gives, for
 * each point, the direction in which the ribbon is wide.
 */
export function ribbonGeometry(points, widthDirs, width, { widthFn = null, uvScale = 1 } = {}) {
  const n = points.length;
  const pos = new Float32Array(n * 2 * 3);
  const uv = new Float32Array(n * 2 * 2);
  const idx = [];
  let len = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) len += points[i].distanceTo(points[i - 1]);
    const w = (widthFn ? widthFn(i / (n - 1)) : 1) * width * 0.5;
    const p = points[i];
    const d = widthDirs[i];
    pos.set([p.x + d.x * w, p.y + d.y * w, p.z + d.z * w], i * 6);
    pos.set([p.x - d.x * w, p.y - d.y * w, p.z - d.z * w], i * 6 + 3);
    uv.set([len * uvScale, 1, len * uvScale, 0], i * 4);
    if (i < n - 1) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Split an element's text into animatable spans (chars, grouped by word). */
export function splitText(el, mode = 'chars') {
  const text = el.textContent;
  el.textContent = '';
  el.setAttribute('aria-label', text);
  const out = [];
  const words = text.split(/(\s+)/);
  for (const word of words) {
    if (/^\s+$/.test(word)) {
      el.appendChild(document.createTextNode(' '));
      continue;
    }
    const w = document.createElement('span');
    w.className = 'w';
    w.setAttribute('aria-hidden', 'true');
    if (mode === 'words') {
      w.textContent = word;
      out.push(w);
    } else {
      for (const ch of word) {
        const s = document.createElement('span');
        s.className = 'ch';
        s.textContent = ch;
        w.appendChild(s);
        out.push(s);
      }
    }
    el.appendChild(w);
  }
  return out;
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Dispose every geometry/material/texture below an object. */
export function disposeObject(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      for (const k in m) {
        const v = m[k];
        if (v && v.isTexture && v !== glowTex && v !== blobTex) v.dispose();
      }
      m.dispose();
    }
  });
}
