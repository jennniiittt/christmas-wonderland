import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32, clamp, lerp, glowSprite, makeCanvas, canvasTexture, ribbonGeometry } from '../utils/helpers.js';
import { makeBow } from '../utils/bow.js';
import { NOISE_GLSL } from '../utils/glsl.js';
import { world } from '../core/world.js';
import { ORNAMENTS } from '../config/ornaments.js';

/* Tree proportions (world units ≈ metres). */
export const TREE = { yBase: 1.25, yTop: 15.1, rBase: 5.5 };
const H = TREE.yTop - TREE.yBase;

export function treeT(y) {
  return clamp((y - TREE.yBase) / H, 0, 1);
}
export function radiusAt(y) {
  const t = treeT(y);
  return TREE.rBase * Math.pow(1 - t, 1.0) + 0.16;
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

/* --------------------------------------------------------------------------
   Fir frond template: a fern-like spray of tapered needle blades in three
   layers (flat, lifted and drooping) so it reads as volume from any angle.
   -------------------------------------------------------------------------- */
function frondGeometry() {
  const pos = [];
  const col = [];
  const tip = [];
  const nrm = [];
  const idx = [];
  const rnd = mulberry32(99);
  const cBase = new THREE.Color(0x0b2416);
  const cMid = new THREE.Color(0x1a4228);
  const cTip = new THREE.Color(0x3f7b45);
  const tmp = new THREE.Color();
  let v = 0;
  const add = (x, y, z, c, t, nx, ny, nz) => {
    pos.push(x, y, z);
    col.push(c.r, c.g, c.b);
    tip.push(t);
    const l = Math.hypot(nx, ny, nz);
    nrm.push(nx / l, ny / l, nz / l);
    return v++;
  };
  const N = 8;
  const layers = [
    { ang: 1.0, up: -0.04, len: 1 },
    { ang: 0.7, up: 0.42, len: 0.72 },
    { ang: 1.15, up: -0.5, len: 0.62 },
  ];
  for (const L of layers) {
    for (let i = 0; i < N; i++) {
      const s = (i + 0.5 + (rnd() - 0.5) * 0.3) / N;
      const sx = s * 0.94;
      const sy = -0.05 * s * s;
      const len = (0.36 - s * 0.2) * L.len * (0.85 + rnd() * 0.3);
      for (const side of [-1, 1]) {
        const ang = L.ang + (rnd() - 0.5) * 0.25;
        const dx = Math.cos(ang);
        const dz = Math.sin(ang) * side;
        const up = L.up + (rnd() - 0.5) * 0.2;
        const tx = sx + dx * len;
        const tz = dz * len;
        const ty = sy + up * len - 0.05 * len;
        const px = -dz;
        const pz = dx;
        const w = len * 0.17;
        const m = 0.42;
        const jitter = 0.85 + rnd() * 0.3;
        tmp.copy(cTip).multiplyScalar(jitter);
        const nUp = [dx * 0.2, 1, dz * 0.2];
        const b = add(sx, sy, 0, cBase, 0, ...nUp);
        const l = add(sx + dx * len * m + px * w, sy + up * len * m + 0.012, dz * len * m + pz * w, cMid, 0.5, ...nUp);
        const r = add(sx + dx * len * m - px * w, sy + up * len * m + 0.012, dz * len * m - pz * w, cMid, 0.5, ...nUp);
        const t = add(tx, ty, tz, tmp, 1, ...nUp);
        idx.push(b, l, t, b, t, r);
      }
    }
  }
  // terminal shoot
  {
    const nUp = [0.2, 1, 0];
    const b = add(0.8, -0.03, 0, cMid, 0.3, ...nUp);
    const l = add(0.93, -0.03, 0.04, cMid, 0.6, ...nUp);
    const r = add(0.93, -0.03, -0.04, cMid, 0.6, ...nUp);
    const t = add(1.12, -0.02, 0, cTip, 1, ...nUp);
    idx.push(b, l, t, b, t, r);
  }
  // make every blade's front face point up (consistent lighting + snow)
  const P = (i) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  for (let i = 0; i < idx.length; i += 3) {
    const a = P(idx[i]);
    const n = new THREE.Vector3().crossVectors(P(idx[i + 1]).sub(a), P(idx[i + 2]).sub(a));
    if (n.y < 0) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aTip', new THREE.Float32BufferAttribute(tip, 1));
  g.setIndex(idx);
  return g;
}

function frondMaterial(uniforms) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aTip;
        varying float vTip;
        varying float vUpN;
        varying vec3 vWPos;`
      )
      .replace(
        '#include <defaultnormal_vertex>',
        `#include <defaultnormal_vertex>
        vec3 wN = objectNormal;
        #ifdef USE_INSTANCING
          wN = mat3(instanceMatrix) * wN;
        #endif
        wN = normalize(mat3(modelMatrix) * wN);
        vUpN = wN.y;
        vTip = aTip;`
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
        #endif
        vWPos = (modelMatrix * wp).xyz;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        ${NOISE_GLSL}
        uniform float uTime, uSnow, uGlow;
        uniform vec3 uGlowColor;
        varying float vTip;
        varying float vUpN;
        varying vec3 vWPos;`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float upN = gl_FrontFacing ? vUpN : -vUpN;
        float sn = smoothstep(0.45, 0.9, upN) * (0.3 + 0.7 * vTip);
        sn *= smoothstep(0.62 - uSnow * 0.5, 0.9 - uSnow * 0.3, cwNoise(vWPos * 2.3));
        sn = clamp(sn * (0.4 + uSnow * 1.2), 0.0, 0.92);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.84, 0.95), sn);`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float gN = cwNoise(vWPos * 1.35 + vec3(0.0, uTime * 0.12, uTime * 0.05));
        float gN2 = cwNoise(vWPos * 4.0 - vec3(uTime * 0.2));
        float glow = pow(gN, 3.2) * (0.6 + 0.8 * gN2) * (0.2 + 0.8 * vTip);
        totalEmissiveRadiance += uGlowColor * uGlow * glow * 0.75 * (1.0 - sn * 0.7);
        totalEmissiveRadiance += vec3(0.75, 0.82, 1.0) * sn * 0.03;`
      );
  };
  return mat;
}

/* --------------------------------------------------------------------------
   Fairy lights shader
   -------------------------------------------------------------------------- */
function fairyLights(positions, hs, rands, sizes) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('aH', new THREE.Float32BufferAttribute(hs, 1));
  geo.setAttribute('aRand', new THREE.Float32BufferAttribute(rands, 1));
  geo.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
  const mk = () => [0, 1, 2, 3].map(() => new THREE.Color());
  const uniforms = {
    uTime: { value: 0 },
    uReveal: { value: 0 },
    uTransition: { value: 1 },
    uIntensity: { value: 1 },
    uTwinkle: { value: 1 },
    uWave: { value: -1 },
    uFrom: { value: mk() },
    uTo: { value: mk() },
    uPixelRatio: world.uniforms.uPixelRatio,
    uPointScale: world.uniforms.uPointScale,
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aH, aRand, aSize;
      uniform float uTime, uReveal, uTransition, uIntensity, uTwinkle, uWave, uPixelRatio, uPointScale;
      uniform vec3 uFrom[4];
      uniform vec3 uTo[4];
      varying vec3 vColor;
      varying float vAlpha;
      vec3 pick(float r, bool to) {
        float i = floor(r * 3.999);
        if (to) return i < 1.0 ? uTo[0] : i < 2.0 ? uTo[1] : i < 3.0 ? uTo[2] : uTo[3];
        return i < 1.0 ? uFrom[0] : i < 2.0 ? uFrom[1] : i < 3.0 ? uFrom[2] : uFrom[3];
      }
      void main() {
        float w = smoothstep(aH - 0.06, aH + 0.06, uTransition * 1.14 - 0.07);
        vColor = mix(pick(aRand, false), pick(aRand, true), w);
        float sp = 1.1 + fract(aRand * 13.7) * 2.6;
        float tw = 0.62 + 0.38 * sin(uTime * sp + aRand * 71.0);
        float sparkle = pow(max(0.0, sin(uTime * (0.35 + fract(aRand * 7.3) * 0.6) + aRand * 91.0)), 40.0);
        float reveal = smoothstep(aH - 0.04, aH + 0.01, uReveal * 1.08 - 0.03);
        // a bright wave that can sweep up the tree (special moments)
        float wave = exp(-pow((aH - uWave) * 9.0, 2.0)) * step(-0.5, uWave);
        vAlpha = reveal * (mix(1.0, tw, uTwinkle) + sparkle * 0.9 + wave * 1.6) * uIntensity;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (1.0 + sparkle * 0.35 + wave * 0.5) * uPointScale * uPixelRatio / -mv.z;
        if (vAlpha <= 0.002) gl_PointSize = 0.0;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float core = exp(-d * d * 30.0);
        float halo = exp(-d * d * 5.0) * 0.32;
        float a = (core + halo) * vAlpha;
        if (a < 0.003) discard;
        vec3 col = vColor * (halo * 1.4 + core * 2.6) + vec3(1.0, 0.94, 0.82) * core * 1.1;
        gl_FragColor = vec4(col * vAlpha, 1.0);
      }
    `,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 6;
  return { object: pts, uniforms };
}

/* --------------------------------------------------------------------------
   Star
   -------------------------------------------------------------------------- */
function raysTexture() {
  const [c, ctx] = makeCanvas(256);
  ctx.translate(128, 128);
  const rnd = mulberry32(4);
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2 + rnd() * 0.08;
    const len = 60 + rnd() * 66;
    const g = ctx.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
    g.addColorStop(0, 'rgba(255,240,210,0.55)');
    g.addColorStop(1, 'rgba(255,220,160,0)');
    ctx.strokeStyle = g;
    ctx.lineWidth = i % 2 ? 1.2 : 2.6;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
    ctx.stroke();
  }
  return canvasTexture(c, { srgb: false });
}

function createStar() {
  const group = new THREE.Group();
  const shape = new THREE.Shape();
  const spikes = 5;
  for (let i = 0; i <= spikes * 2; i++) {
    const r = i % 2 === 0 ? 0.95 : 0.4;
    const a = (i / (spikes * 2)) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.07, bevelSegments: 3 });
  geo.center();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffd98a,
    emissive: 0xffb54d,
    emissiveIntensity: 0,
    metalness: 0.65,
    roughness: 0.22,
  });
  const mesh = new THREE.Mesh(geo, mat);
  group.add(mesh);

  const halo = glowSprite(0xffcf86, 7.5, 0);
  group.add(halo);
  const inner = glowSprite(0xfff3dc, 2.8, 0);
  group.add(inner);
  const rays = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: raysTexture(), color: 0xffe0a8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
  );
  rays.scale.setScalar(10);
  group.add(rays);
  const light = new THREE.PointLight(0xffc670, 0, 16, 1.6);
  group.add(light);

  const hit = new THREE.Mesh(new THREE.SphereGeometry(1.3, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
  group.add(hit);

  return { group, mesh, mat, halo, inner, rays, light, hit, level: 0 };
}

/* --------------------------------------------------------------------------
   Ornament materials
   -------------------------------------------------------------------------- */
function baubleMaterials() {
  return [
    new THREE.MeshPhysicalMaterial({ color: 0xd8a03c, metalness: 1, roughness: 0.17 }),
    new THREE.MeshPhysicalMaterial({ color: 0x8a0d20, metalness: 0.3, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.06 }),
    new THREE.MeshPhysicalMaterial({ color: 0xd9dee8, metalness: 1, roughness: 0.1 }),
    new THREE.MeshPhysicalMaterial({ color: 0xe9cf9b, metalness: 0.85, roughness: 0.34 }),
  ];
}

const MAGIC_STYLE = {
  wish: { color: 0xf3c768, emissive: 0xffb340, halo: 0xffcf7a },
  message: { color: 0xb3203c, emissive: 0xff4060, halo: 0xff8a9a },
  surprise: { color: 0x1f8f62, emissive: 0x3dffaa, halo: 0x8affd0 },
  gift: { color: 0xc9d8f0, emissive: 0x9cc8ff, halo: 0xbfe0ff },
};

/* --------------------------------------------------------------------------
   Build
   -------------------------------------------------------------------------- */
export async function createChristmasTree({ settings, glowColor, onProgress = () => {} }) {
  const rnd = mulberry32(2024);
  const group = new THREE.Group();
  group.name = 'tree';

  const frondUniforms = {
    uTime: world.uniforms.uTime,
    uSnow: { value: 0.22 },
    uGlow: { value: 0 },
    uGlowColor: glowColor,
  };

  /* ---------- branches ---------- */
  const transforms = [];
  const push = (x, y, z, yaw, pitch, roll, sl, sw) => transforms.push([x, y, z, yaw, pitch, roll, sl, sw]);

  const whorls = 24;
  for (let w = 0; w < whorls; w++) {
    const t = (w + 0.15 + rnd() * 0.5) / whorls;
    const y = TREE.yBase + t * (H - 0.7);
    const R = radiusAt(y);
    const count = Math.round(5 + 9 * (1 - t));
    const off = rnd() * Math.PI * 2;
    for (let j = 0; j < count; j++) {
      const a = off + (j / count) * Math.PI * 2 + (rnd() - 0.5) * 0.4;
      const L = R * (0.9 + rnd() * 0.16);
      const pitchBase = lerp(-0.2, 0.42, t);
      const segs = Math.max(1, Math.round(L / 0.8));
      const segLen = L / segs;
      for (let k = 0; k < segs; k++) {
        const d0 = k * segLen * 0.92 + 0.15;
        const u = d0 / Math.max(R, 0.5);
        const droop = -0.55 * u * u * (1 - t) + 0.1 * t * u;
        const x = Math.cos(a) * d0;
        const z = Math.sin(a) * d0;
        const yy = y + droop;
        const yaw = -a + (k > 0 ? (k % 2 ? 0.22 : -0.22) : 0) + (rnd() - 0.5) * 0.2;
        const pitch = pitchBase - u * 0.25 * (1 - t) + (k === segs - 1 ? 0.12 : 0);
        const sl = segLen * 1.45;
        const sw = clamp(0.75 + 0.55 * (1 - t), 0.6, 1.3);
        push(x, yy, z, yaw, pitch, (rnd() - 0.5) * 0.3, sl, sw);
        // side sprays
        if (segLen > 0.45) {
          const side = rnd() > 0.5 ? 1 : -1;
          push(x, yy + 0.04, z, yaw + side * (0.65 + rnd() * 0.35), pitch + 0.05, (rnd() - 0.5) * 0.5, sl * 0.72, sw * 0.85);
        }
      }
    }
  }
  // fill fronds across the silhouette for a lush surface
  const fillCount = Math.max(0, settings.fronds - transforms.length - 24);
  let made = 0;
  while (made < fillCount) {
    const t = Math.pow(rnd(), 1.15) * 0.97;
    const y = TREE.yBase + t * H;
    const R = radiusAt(y);
    if (rnd() > (R + 0.6) / (TREE.rBase + 0.6) + 0.15) continue; // sample by surface area
    const a = rnd() * Math.PI * 2;
    const rr = R * (0.68 + rnd() * 0.3);
    const x = Math.cos(a) * rr;
    const z = Math.sin(a) * rr;
    const s = (0.85 + rnd() * 0.65) * (1 - t * 0.5);
    push(x, y - 0.1 * (1 - t), z, -a + (rnd() - 0.5) * 1.2, lerp(-0.15, 0.45, t) + (rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.9, s, s * (0.9 + rnd() * 0.2));
    made++;
  }
  // leader at the very top
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const y = TREE.yTop - 0.9 + (i / 24) * 0.7;
    push(Math.cos(a) * 0.1, y, Math.sin(a) * 0.1, -a, 1.05 + rnd() * 0.3, rnd(), 0.75, 0.55);
  }

  const frondGeo = frondGeometry();
  const frondMat = frondMaterial(frondUniforms);
  const fronds = new THREE.InstancedMesh(frondGeo, frondMat, transforms.length);
  const m4 = new THREE.Matrix4();
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const p = new THREE.Vector3();
  const col = new THREE.Color();
  transforms.forEach((tr, i) => {
    const [x, y, z, yaw, pitch, roll, sl, sw] = tr;
    e.set(roll, yaw, pitch, 'YZX');
    q.setFromEuler(e);
    p.set(x, y, z);
    sc.set(sl, sw, sw);
    m4.compose(p, q, sc);
    fronds.setMatrixAt(i, m4);
    const shade = 0.78 + rnd() * 0.4;
    col.setRGB(shade * (0.95 + rnd() * 0.1), shade, shade * (0.92 + rnd() * 0.12));
    fronds.setColorAt(i, col);
  });
  fronds.instanceMatrix.needsUpdate = true;
  fronds.computeBoundingSphere();
  group.add(fronds);
  onProgress(0.35, 'Weaving evergreen branches');
  await nextFrame();

  /* ---------- body, trunk, skirt ---------- */
  const body = new THREE.Mesh(
    new THREE.ConeGeometry(radiusAt(TREE.yBase) * 0.74, H + 0.2, 40, 10, true),
    new THREE.MeshLambertMaterial({ color: 0x07160d, emissive: 0x150b02 })
  );
  body.position.y = TREE.yBase + (H + 0.2) / 2 - 0.15;
  group.add(body);

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.5, 3.2, 14),
    new THREE.MeshLambertMaterial({ color: 0x3a2618 })
  );
  trunk.position.y = 1.4;
  group.add(trunk);

  // velvet tree skirt with a gold trim
  const skirtR = 3.3;
  const skirtGeo = new THREE.CircleGeometry(skirtR, 128, 0, Math.PI * 2);
  const sp = skirtGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i);
    const y = sp.getY(i);
    const r = Math.hypot(x, y);
    const a = Math.atan2(y, x);
    const k = r / skirtR;
    const rr = r * (1 + 0.045 * Math.sin(a * 11) * k);
    sp.setXYZ(i, Math.cos(a) * rr, Math.sin(a) * rr, 0.07 * Math.sin(a * 11) * k * k + 0.05 * (1 - k));
  }
  skirtGeo.computeVertexNormals();
  skirtGeo.rotateX(-Math.PI / 2);
  const skirt = new THREE.Mesh(
    skirtGeo,
    new THREE.MeshPhysicalMaterial({ color: 0x5c0c1a, roughness: 0.9, sheen: 1, sheenColor: new THREE.Color(0xff7088), sheenRoughness: 0.45 })
  );
  skirt.position.y = 0.2;
  group.add(skirt);
  const trimPts = [];
  for (let i = 0; i < 160; i++) {
    const a = (i / 160) * Math.PI * 2;
    const rr = skirtR * (1 + 0.045 * Math.sin(a * 11));
    trimPts.push(new THREE.Vector3(Math.cos(a) * rr, 0.2 + 0.07 * Math.sin(a * 11), -Math.sin(a) * rr));
  }
  const trim = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(trimPts, true), 320, 0.06, 8, true),
    new THREE.MeshStandardMaterial({ color: 0xe0b866, metalness: 0.9, roughness: 0.3 })
  );
  group.add(trim);

  /* ---------- ornaments ---------- */
  const magicSpots = ORNAMENTS.map((o) => {
    const y = TREE.yBase + o.height * H;
    const a = o.angle;
    const r = radiusAt(y) + 0.22;
    return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
  });

  const placed = [];
  const farEnough = (v, d) => placed.every((o) => o.distanceToSquared(v) > d * d) && magicSpots.every((o) => o.distanceToSquared(v) > 1.1);
  const baubleMats = baubleMaterials();
  const baubleGeo = new THREE.SphereGeometry(1, 22, 16);
  const capGeo = new THREE.CylinderGeometry(0.22, 0.26, 0.28, 10);
  capGeo.translate(0, 1.06, 0);
  const capMat = new THREE.MeshStandardMaterial({ color: 0xc8a560, metalness: 1, roughness: 0.3 });
  const baubleMatrices = baubleMats.map(() => []);
  const capMatrices = [];
  let tries = 0;
  while (placed.length < settings.baubles && tries < 20000) {
    tries++;
    const t = Math.pow(rnd(), 1.1) * 0.9 + 0.02;
    const y = TREE.yBase + t * H;
    const a = rnd() * Math.PI * 2;
    const R = radiusAt(y);
    const rr = R * (0.9 + rnd() * 0.08) + 0.12;
    const v = new THREE.Vector3(Math.cos(a) * rr, y - 0.15 * (1 - t), Math.sin(a) * rr);
    if (!farEnough(v, 0.85 - t * 0.2)) continue;
    placed.push(v);
    const s = (0.17 + rnd() * 0.12) * (1 - t * 0.35);
    m4.compose(v, q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6), sc.set(s, s, s));
    baubleMatrices[(rnd() * 4) | 0].push(m4.clone());
    capMatrices.push(m4.clone());
  }
  baubleMats.forEach((mat, i) => {
    const im = new THREE.InstancedMesh(baubleGeo, mat, baubleMatrices[i].length);
    baubleMatrices[i].forEach((mm, j) => im.setMatrixAt(j, mm));
    im.instanceMatrix.needsUpdate = true;
    group.add(im);
  });
  const caps = new THREE.InstancedMesh(capGeo, capMat, capMatrices.length);
  capMatrices.forEach((mm, j) => caps.setMatrixAt(j, mm));
  group.add(caps);

  // teardrop finials
  const prof = [];
  for (let i = 0; i <= 16; i++) {
    const u = i / 16;
    const r = Math.sin(u * Math.PI) * (u < 0.35 ? 1 : Math.pow(1 - (u - 0.35) / 0.65, 0.9)) * 0.42;
    prof.push(new THREE.Vector2(Math.max(r, 0.001), -u * 1.6));
  }
  const finialGeo = new THREE.LatheGeometry(prof, 14);
  const finialMats = [
    new THREE.MeshPhysicalMaterial({ color: 0xd9dee8, metalness: 1, roughness: 0.12 }),
    new THREE.MeshPhysicalMaterial({ color: 0xd8a03c, metalness: 1, roughness: 0.2 }),
  ];
  const finialM = [[], []];
  tries = 0;
  let finials = 0;
  while (finials < 34 && tries < 6000) {
    tries++;
    const t = 0.08 + rnd() * 0.75;
    const y = TREE.yBase + t * H;
    const a = rnd() * Math.PI * 2;
    const rr = radiusAt(y) * 0.95 + 0.12;
    const v = new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr);
    if (!farEnough(v, 0.7)) continue;
    placed.push(v);
    const s = 0.42 * (1 - t * 0.3);
    m4.compose(v, q.identity(), sc.set(s, s, s));
    finialM[finials % 2].push(m4.clone());
    finials++;
  }
  finialMats.forEach((mat, i) => {
    const im = new THREE.InstancedMesh(finialGeo, mat, finialM[i].length);
    finialM[i].forEach((mm, j) => im.setMatrixAt(j, mm));
    group.add(im);
  });
  onProgress(0.5, 'Hanging the ornaments');
  await nextFrame();

  /* ---------- ribbon spiral ---------- */
  const [rc, rctx] = makeCanvas(256, 64);
  const rg = rctx.createLinearGradient(0, 0, 0, 64);
  rg.addColorStop(0, '#b8924e');
  rg.addColorStop(0.08, '#f1dca8');
  rg.addColorStop(0.14, '#c9a660');
  rg.addColorStop(0.5, '#ead2a0');
  rg.addColorStop(0.86, '#c9a660');
  rg.addColorStop(0.92, '#f1dca8');
  rg.addColorStop(1, '#b8924e');
  rctx.fillStyle = rg;
  rctx.fillRect(0, 0, 256, 64);
  rctx.globalAlpha = 0.08;
  for (let x = 0; x < 256; x += 3) {
    rctx.fillStyle = x % 6 ? '#fff' : '#000';
    rctx.fillRect(x, 0, 1, 64);
  }
  const ribbonTex = canvasTexture(rc, { repeat: [1, 1] });
  ribbonTex.wrapS = THREE.RepeatWrapping;
  const ribbonMat = new THREE.MeshStandardMaterial({ map: ribbonTex, metalness: 0.55, roughness: 0.32, side: THREE.DoubleSide });
  const turns = 3.4;
  const rPts = [];
  const rDirs = [];
  const nR = 700;
  for (let i = 0; i <= nR; i++) {
    const u = i / nR;
    const y = TREE.yBase + 0.8 + u * (H - 2.6);
    const a = u * turns * Math.PI * 2 + 0.6;
    const tuck = Math.sin(u * turns * 9 * Math.PI * 2);
    const r = radiusAt(y) * 0.9 + 0.18 + tuck * 0.16;
    rPts.push(new THREE.Vector3(Math.cos(a) * r, y + tuck * 0.06, Math.sin(a) * r));
    // ribbon lies along the cone's slant
    const slope = TREE.rBase / H;
    rDirs.push(new THREE.Vector3(Math.cos(a) * slope, 1, Math.sin(a) * slope).normalize());
  }
  group.add(new THREE.Mesh(ribbonGeometry(rPts, rDirs, 0.34, { uvScale: 0.25 }), ribbonMat));

  /* ---------- bead garlands (swags) ---------- */
  const beadPositions = [];
  const swagLevels = [0.14, 0.3, 0.46, 0.62, 0.77];
  swagLevels.forEach((lt, li) => {
    const y = TREE.yBase + lt * H;
    const R = radiusAt(y);
    const swags = Math.max(4, Math.round(R * 1.7));
    const off = li * 0.7;
    for (let s = 0; s < swags; s++) {
      const a0 = off + (s / swags) * Math.PI * 2;
      const a1 = off + ((s + 1) / swags) * Math.PI * 2;
      const arc = (a1 - a0) * R;
      const n = Math.round((arc / 0.11) * settings.beads);
      for (let i = 0; i < n; i++) {
        const u = i / n;
        const a = lerp(a0, a1, u);
        const sag = Math.sin(u * Math.PI);
        const yy = y - sag * (0.32 + R * 0.05);
        const rr = radiusAt(yy) * 0.93 + 0.2 + sag * 0.12;
        beadPositions.push(new THREE.Vector3(Math.cos(a) * rr, yy, Math.sin(a) * rr));
      }
    }
  });
  const beads = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.05, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xf0d79c, metalness: 0.9, roughness: 0.22 }),
    beadPositions.length
  );
  beadPositions.forEach((bp, i) => {
    m4.makeTranslation(bp.x, bp.y, bp.z);
    beads.setMatrixAt(i, m4);
  });
  group.add(beads);

  /* ---------- velvet bows on the tree ---------- */
  const velvet = new THREE.MeshPhysicalMaterial({
    color: 0x7a0c1e,
    roughness: 0.75,
    sheen: 1,
    sheenColor: new THREE.Color(0xff5a72),
    sheenRoughness: 0.4,
    side: THREE.DoubleSide,
  });
  for (let i = 0; i < 9; i++) {
    const t = 0.12 + (i / 9) * 0.68;
    const y = TREE.yBase + t * H;
    const a = i * 2.39996 + 0.9;
    const rr = radiusAt(y) + 0.15;
    const v = new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr);
    if (!magicSpots.every((o) => o.distanceTo(v) > 1.2)) continue;
    const bow = makeBow({ size: 1.25 * (1 - t * 0.3), material: velvet, tails: false });
    bow.position.copy(v);
    bow.lookAt(v.x * 2, v.y, v.z * 2);
    bow.rotateX(-0.25);
    group.add(bow);
  }

  /* ---------- fairy lights ---------- */
  const lp = [];
  const lh = [];
  const lr = [];
  const ls = [];
  const addLight = (v, size) => {
    lp.push(v.x, v.y, v.z);
    lh.push(treeT(v.y));
    lr.push(rnd());
    ls.push(size);
  };
  // three spiralling strands
  const strands = 3;
  let budget = settings.lights;
  const perStrand = Math.floor((budget * 0.55) / strands);
  for (let s = 0; s < strands; s++) {
    for (let i = 0; i < perStrand; i++) {
      const u = i / perStrand;
      const y = TREE.yBase + 0.3 + u * (H - 0.9);
      const a = u * 7.5 * Math.PI * 2 + (s / strands) * Math.PI * 2;
      const rr = radiusAt(y) * 0.97 + 0.15 + (rnd() - 0.5) * 0.12;
      addLight(new THREE.Vector3(Math.cos(a) * rr, y + Math.sin(u * 300) * 0.05, Math.sin(a) * rr), 0.17 + rnd() * 0.05);
    }
  }
  budget -= perStrand * strands;
  for (let i = 0; i < budget; i++) {
    const t = Math.pow(rnd(), 1.2) * 0.97;
    const y = TREE.yBase + t * H;
    const a = rnd() * Math.PI * 2;
    const deep = rnd() < 0.3;
    const rr = radiusAt(y) * (deep ? 0.62 + rnd() * 0.2 : 0.95 + rnd() * 0.06) + (deep ? 0 : 0.12);
    addLight(new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr), deep ? 0.24 : 0.15 + rnd() * 0.07);
  }
  const fairy = fairyLights(lp, lh, lr, ls);
  group.add(fairy.object);

  /* ---------- magic (clickable) ornaments ---------- */
  const magic = ORNAMENTS.map((cfg, i) => {
    const style = MAGIC_STYLE[cfg.type] ?? MAGIC_STYLE.wish;
    const g = new THREE.Group();
    g.position.copy(magicSpots[i]);
    const mat = new THREE.MeshPhysicalMaterial({
      color: style.color,
      metalness: cfg.type === 'surprise' ? 0.3 : 0.75,
      roughness: 0.12,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      emissive: style.emissive,
      emissiveIntensity: 0.35,
    });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.36, 32, 24), mat);
    g.add(ball);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.12, 12), capMat);
    cap.position.y = 0.39;
    g.add(cap);
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 16), capMat);
    loop.position.y = 0.48;
    g.add(loop);
    // a fine gold band around the equator
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.362, 0.014, 6, 48), capMat);
    band.rotation.x = Math.PI / 2;
    g.add(band);
    const halo = glowSprite(style.halo, 1.9, 0.0);
    g.add(halo);
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), new THREE.MeshBasicMaterial({ visible: false }));
    g.add(hit);
    group.add(g);
    return { cfg, group: g, ball, mat, halo, hit, phase: rnd() * 6.28, hover: 0, focus: 0, spin: 0, seen: false };
  });
  onProgress(0.62, 'Stringing the fairy lights');
  await nextFrame();

  /* ---------- star ---------- */
  const star = createStar();
  star.group.position.set(0, TREE.yTop + 0.75, 0);
  group.add(star.group);

  /* ---------- lights that warm the branches ---------- */
  const pointLights = [];
  const lightSpots = [
    [4.5, 4.2, 4.5, 26],
    [-5.0, 6.5, 3.0, 22],
    [1.0, 9.5, 4.8, 16],
    [-1.5, 3.2, -5.5, 18],
    [0, 2.6, 9.5, 14], // fill for the presents
  ];
  for (const [x, y, z, i] of lightSpots) {
    const l = new THREE.PointLight(0xffad55, 0, 13, 1.4);
    l.position.set(x, y, z);
    l.userData.max = i;
    group.add(l);
    pointLights.push(l);
  }

  /* ---------- update ---------- */
  const tmpV = new THREE.Vector3();
  function update(dt, t) {
    fairy.uniforms.uTime.value += dt;
    // star
    star.rays.material.rotation += dt * 0.05;
    const pulse = 0.92 + Math.sin(t * 1.3) * 0.05 + Math.sin(t * 3.1) * 0.03;
    star.halo.scale.setScalar(7.5 * pulse * (0.4 + 0.6 * star.level) + star.flare * 6);
    star.inner.scale.setScalar(2.8 * pulse + star.flare * 2);
    star.halo.material.opacity = 0.8 * star.level + star.flare * 0.4;
    star.inner.material.opacity = 0.9 * star.level;
    star.rays.material.opacity = 0.55 * star.level + star.flare * 0.5;
    star.mat.emissiveIntensity = 2.4 * star.level + star.flare * 3;
    star.light.intensity = 22 * star.level;
    star.mesh.rotation.y = Math.sin(t * 0.4) * 0.35;
    // magic ornaments: gentle sway, pulsing glow, hover response
    for (const m of magic) {
      const sway = Math.sin(t * 0.9 + m.phase) * 0.06;
      m.group.rotation.z = sway;
      m.ball.rotation.y += dt * (0.25 + m.spin);
      m.spin = Math.max(0, m.spin - dt * 2.5);
      const glow = 0.5 + 0.5 * Math.sin(t * 2 + m.phase);
      const k = Math.max(m.hover, m.focus);
      m.mat.emissiveIntensity = (0.25 + glow * 0.35 + k * 1.4) * revealK;
      m.halo.material.opacity = (0.35 + glow * 0.35 + k * 0.6) * revealK * (m.seen ? 0.7 : 1);
      const s = 1 + k * 0.18;
      m.group.scale.setScalar(s);
    }
  }
  let revealK = 0;
  star.flare = 0;

  return {
    group,
    body,
    fronds,
    fairy,
    star,
    magic,
    pointLights,
    frondUniforms,
    update,
    setReveal(v) {
      revealK = v;
    },
    get reveal() {
      return revealK;
    },
  };
}
