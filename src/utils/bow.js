import * as THREE from 'three';
import { ribbonGeometry } from './helpers.js';

function loopGeometry(L, H, width) {
  const pts = [];
  const dirs = [];
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    const k = (1 - Math.cos(t)) / 2;
    pts.push(new THREE.Vector3(L * k, H * Math.sin(t) * Math.sqrt(k) * 1.1, 0));
    // twist the band slightly as it goes round so the loop looks soft and full
    dirs.push(new THREE.Vector3(0, Math.sin(t) * 0.25, 1).normalize());
  }
  return ribbonGeometry(pts, dirs, width, { widthFn: (u) => 0.75 + 0.25 * Math.sin(u * Math.PI) });
}

function tailGeometry(length, width, angle) {
  const pts = [];
  const dirs = [];
  const d = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
  const perp = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0)).normalize();
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const p = d.clone().multiplyScalar(u * length);
    p.y = -0.02 - u * 0.06 + Math.sin(u * Math.PI * 2) * 0.025 * length;
    pts.push(p);
    dirs.push(perp.clone().add(new THREE.Vector3(0, Math.sin(u * 5) * 0.2, 0)).normalize());
  }
  return ribbonGeometry(pts, dirs, width, { widthFn: (u) => 1 - u * 0.15 });
}

/**
 * A soft satin bow: two teardrop loops, a knot and two tails.
 * Returns a group with named parts so presents can animate it coming loose.
 */
export function makeBow({ size = 1, material, tails = true }) {
  const g = new THREE.Group();
  const L = 0.42 * size;
  const H = 0.24 * size;
  const W = 0.16 * size;
  const loopGeo = loopGeometry(L, H, W);

  const loops = [];
  for (const side of [1, -1]) {
    const pivot = new THREE.Group();
    const loop = new THREE.Mesh(loopGeo, material);
    loop.rotation.z = 0.42;
    pivot.add(loop);
    pivot.rotation.y = side === 1 ? 0.12 : Math.PI - 0.12;
    pivot.position.y = 0.02 * size;
    g.add(pivot);
    loops.push(pivot);
  }

  const knot = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), material);
  knot.scale.set(0.085 * size, 0.075 * size, 0.1 * size);
  knot.position.y = 0.04 * size;
  g.add(knot);

  const tailMeshes = [];
  if (tails) {
    for (const a of [Math.PI * 0.62, Math.PI * 0.38 - Math.PI]) {
      const t = new THREE.Mesh(tailGeometry(0.62 * size, W * 0.85, a), material);
      g.add(t);
      tailMeshes.push(t);
    }
  }
  g.userData = { loops, knot, tails: tailMeshes };
  return g;
}

