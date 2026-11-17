import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32, createNoise2D, makeCanvas, canvasTexture, glowSprite, smoothstep } from '../utils/helpers.js';
import { world } from '../core/world.js';

const HORIZON = new THREE.Color(0x0d1a33);
const ZENITH = new THREE.Color(0x02040b);

/* --------------------------------------------------------------------------
   Sky dome, stars, moon, aurora
   -------------------------------------------------------------------------- */
function createSky() {
  const uniforms = {
    uTop: { value: ZENITH.clone() },
    uHorizon: { value: HORIZON.clone() },
    uGlow: { value: new THREE.Color(0x3a2a1c) },
    uMoonDir: { value: new THREE.Vector3(-0.42, 0.42, -0.8).normalize() },
    uBright: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uHorizon, uGlow, uMoonDir;
      uniform float uBright;
      varying vec3 vDir;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uTop, smoothstep(-0.02, 0.62, h));
        col += uGlow * exp(-max(h, 0.0) * 11.0) * 0.55;
        // faint milky band
        float band = exp(-pow(dot(d, normalize(vec3(0.55, 0.35, -0.75))), 2.0) * 22.0);
        col += vec3(0.05, 0.06, 0.1) * band * smoothstep(0.0, 0.3, h);
        // moon haze
        float m = max(dot(d, uMoonDir), 0.0);
        col += vec3(0.32, 0.38, 0.52) * (pow(m, 60.0) * 0.5 + pow(m, 8.0) * 0.06);
        // dithering to avoid banding
        col += (h21(gl_FragCoord.xy) - 0.5) / 255.0;
        gl_FragColor = vec4(col * uBright, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

function createStars(count, seed = 3) {
  const rnd = mulberry32(seed);
  const pos = new Float32Array(count * 3);
  const rand = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    let x, y, z;
    do {
      x = rnd() * 2 - 1;
      y = rnd();
      z = rnd() * 2 - 1;
    } while (x * x + y * y + z * z > 1 || x * x + y * y + z * z < 0.1);
    const v = new THREE.Vector3(x, y * 0.95 + 0.03, z).normalize().multiplyScalar(360);
    pos.set([v.x, v.y, v.z], i * 3);
    const big = rnd() > 0.965;
    rand.set([rnd(), big ? 2.2 + rnd() * 1.6 : 0.6 + rnd() * 1.1, rnd()], i * 3);
    c.setHSL(rnd() > 0.5 ? 0.6 : 0.1, 0.35 * rnd(), 0.85 + rnd() * 0.15);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const uniforms = { uTime: world.uniforms.uTime, uPixelRatio: world.uniforms.uPixelRatio, uFade: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec3 aRand;
      uniform float uTime, uPixelRatio;
      varying vec3 vC;
      varying float vA;
      void main(){
        vC = color;
        float tw = 0.55 + 0.45 * sin(uTime * (0.6 + aRand.x * 2.4) + aRand.z * 50.0);
        vA = mix(0.35, 1.0, tw);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aRand.y * uPixelRatio * (0.85 + tw * 0.3) * 1.6;
        gl_Position = projectionMatrix * mv;
        gl_Position.z = gl_Position.w * 0.9999;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uFade;
      varying vec3 vC; varying float vA;
      void main(){
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = exp(-d * d * 5.0) * vA * uFade;
        gl_FragColor = vec4(vC * a * 1.4, 1.0);
      }
    `,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = -9;
  return { object: pts, uniforms };
}

function createMoon(dir) {
  const [c, ctx] = makeCanvas(256);
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,250,236,1)');
  g.addColorStop(0.17, 'rgba(250,244,226,1)');
  g.addColorStop(0.2, 'rgba(220,226,240,0.45)');
  g.addColorStop(0.35, 'rgba(170,190,230,0.12)');
  g.addColorStop(1, 'rgba(120,150,220,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  // soft maria
  ctx.globalCompositeOperation = 'source-atop';
  const rnd = mulberry32(9);
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2;
    const r = rnd() * 28;
    ctx.fillStyle = `rgba(190,190,205,${0.18 + rnd() * 0.2})`;
    ctx.beginPath();
    ctx.arc(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 5 + rnd() * 12, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = canvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
  const s = new THREE.Sprite(mat);
  s.position.copy(dir).multiplyScalar(330);
  s.scale.setScalar(70);
  s.renderOrder = -8;
  return s;
}

function createAurora() {
  const uniforms = { uTime: world.uniforms.uTime, uOpacity: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uOpacity;
      varying vec2 vUv;
      float h(float n){ return fract(sin(n) * 43758.5453); }
      float n1(float x){ float i = floor(x); float f = fract(x); f = f*f*(3.-2.*f); return mix(h(i), h(i+1.), f); }
      void main(){
        float x = vUv.x * 9.0;
        float wave = n1(x * 1.3 + uTime * 0.07) * 0.5 + n1(x * 3.1 - uTime * 0.11) * 0.35;
        float base = 0.18 + wave * 0.3;
        float y = vUv.y;
        float curtain = smoothstep(base, base + 0.06, y) * (1.0 - smoothstep(base + 0.05, 0.95, y));
        float rays = 0.55 + 0.45 * n1(vUv.x * 160.0 + uTime * 0.6 + n1(vUv.x * 12.0) * 10.0);
        float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
        vec3 green = vec3(0.15, 0.95, 0.55);
        vec3 teal = vec3(0.1, 0.55, 0.85);
        vec3 violet = vec3(0.55, 0.25, 0.8);
        float k = (y - base) / max(0.95 - base, 0.01);
        vec3 col = mix(green, teal, smoothstep(0.1, 0.5, k));
        col = mix(col, violet, smoothstep(0.55, 1.0, k));
        float a = curtain * rays * edge * pow(1.0 - k, 0.7) * uOpacity;
        gl_FragColor = vec4(col * a * 0.55, 1.0);
      }
    `,
  });
  const geo = new THREE.CylinderGeometry(260, 260, 140, 96, 1, true, Math.PI * 0.55, Math.PI * 0.9);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 125;
  mesh.visible = false;
  mesh.renderOrder = -7;
  return { mesh, uniforms };
}

/* --------------------------------------------------------------------------
   Shooting stars
   -------------------------------------------------------------------------- */
function createShootingStars() {
  const group = new THREE.Group();
  const pool = [];
  for (let i = 0; i < 3; i++) {
    const uniforms = { uHead: { value: 0 }, uAlpha: { value: 0 }, uColor: { value: new THREE.Color(0xfff2d6) } };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: /* glsl */ `
        uniform float uAlpha; uniform vec3 uColor;
        varying vec2 vUv;
        void main(){
          float along = vUv.x;            // 1 = head
          float across = abs(vUv.y - 0.5) * 2.0;
          float tail = pow(along, 2.6);
          float w = mix(0.08, 1.0, along);
          float a = tail * smoothstep(w, 0.0, across);
          float head = exp(-pow((1.0 - along) * 30.0, 2.0)) * smoothstep(1.0, 0.0, across);
          gl_FragColor = vec4(uColor * (a * 1.4 + head * 5.0) * uAlpha, 1.0);
        }
      `,
    });
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(-0.5, 0, 0);
    const quad = new THREE.Mesh(geo, mat);
    const pivot = new THREE.Object3D();
    const holder = new THREE.Object3D();
    quad.position.z = 300;
    holder.add(quad);
    pivot.add(holder);
    pivot.visible = false;
    group.add(pivot);
    pool.push({ pivot, holder, quad, uniforms, active: false, t: 0, dur: 1, sweep: 0.3 });
  }

  let timer = 6;
  const target = new THREE.Vector3();

  function launch({ dir = null, length = 26, width = 0.9, duration = 1.1, sweep = 0.32, color = 0xfff2d6, big = false } = {}) {
    const s = pool.find((p) => !p.active);
    if (!s) return null;
    if (!dir) {
      const a = Math.random() * Math.PI * 2;
      dir = new THREE.Vector3(Math.cos(a), 0.35 + Math.random() * 0.45, Math.sin(a) * 0.6 - 0.6).normalize();
    }
    target.copy(dir);
    s.pivot.position.set(0, 0, 0);
    s.pivot.lookAt(target);
    s.holder.rotation.set(0, 0, 0);
    s.quad.rotation.set(0, 0, big ? -0.35 : (Math.random() - 0.5) * 1.4);
    s.quad.scale.set(length, width, 1);
    s.uniforms.uColor.value.set(color);
    s.active = true;
    s.t = 0;
    s.dur = duration;
    s.sweep = sweep;
    s.pivot.visible = true;
    return s;
  }

  function update(dt) {
    timer -= dt;
    if (timer <= 0) {
      timer = 9 + Math.random() * 16;
      launch();
    }
    for (const s of pool) {
      if (!s.active) continue;
      s.t += dt;
      const k = s.t / s.dur;
      // rotate the holder about the quad's own in-plane axis so it travels along its length
      const ax = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), s.quad.rotation.z);
      s.holder.quaternion.setFromAxisAngle(ax, s.sweep * k);
      s.uniforms.uAlpha.value = Math.sin(Math.min(k, 1) * Math.PI) ** 0.6;
      if (k >= 1) {
        s.active = false;
        s.pivot.visible = false;
      }
    }
  }
  return { group, launch, update };
}

/* --------------------------------------------------------------------------
   Ground
   -------------------------------------------------------------------------- */
/** Height of the snow near the tree (no noise drifts inside r < 9). */
export function groundHeightNear(r) {
  return Math.exp(-((r - 5.8) ** 2) / 4) * 0.22 + 0.03;
}

function createGround(lampPositions) {
  const noise = createNoise2D(11);
  const size = 260;
  const seg = 220;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const r = Math.hypot(x, z);
    const drift = noise.fbm(x * 0.045, z * 0.045, 4);
    const ripple = noise.fbm(x * 0.6 + 40, z * 0.6, 2);
    let h = (drift - 0.45) * 3.2 * smoothstep(9, 30, r) + ripple * 0.06;
    // a soft mound of snow around the tree base
    h += Math.exp(-((r - 5.8) ** 2) / 4) * 0.22;
    // distant rolling hills
    h += smoothstep(40, 120, r) * (noise.fbm(x * 0.012, z * 0.012, 3) * 14 - 3);
    p.setY(i, h);
  }
  geo.computeVertexNormals();

  const glowColor = { value: new THREE.Color(0xffa649) };
  const uniforms = {
    uTime: world.uniforms.uTime,
    uGlow: { value: 0 },
    uGlowColor: glowColor,
    uLamps: { value: lampPositions.map((v) => new THREE.Vector3(v.x, 0, v.z)) },
    uLampGlow: { value: 0 },
    uRing: { value: 0 },
    uRingRadius: { value: 0 },
    uRingCenter: { value: new THREE.Vector3() },
  };
  const mat = new THREE.MeshStandardMaterial({ color: 0xbccbe6, roughness: 0.92, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWPos;
        uniform float uTime, uGlow, uLampGlow, uRing, uRingRadius;
        uniform vec3 uGlowColor, uRingCenter;
        uniform vec3 uLamps[${lampPositions.length}];
        float gh(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float rr = length(vWPos.xz);
          // warm light pooling under the tree
          totalEmissiveRadiance += uGlowColor * uGlow * (exp(-pow(rr / 6.8, 2.0)) * 0.38 + exp(-pow(rr / 15.0, 2.0)) * 0.1);
          // lamp pools
          for (int i = 0; i < ${lampPositions.length}; i++) {
            float ld = length(vWPos.xz - uLamps[i].xz);
            totalEmissiveRadiance += vec3(1.0, 0.62, 0.3) * uLampGlow * exp(-ld * ld / 7.0) * 0.32;
          }
          // expanding ring of light (special gift)
          float rd = abs(length(vWPos.xz - uRingCenter.xz) - uRingRadius);
          totalEmissiveRadiance += vec3(1.0, 0.75, 0.4) * uRing * exp(-rd * rd * 3.0) * 1.6;
          // glitter
          vec2 g = vWPos.xz * 34.0;
          vec2 cell = floor(g);
          float hsh = gh(cell);
          vec2 f = fract(g) - vec2(gh(cell + 3.1), gh(cell + 7.7));
          float dotm = smoothstep(0.22, 0.0, length(f));
          vec3 vd = normalize(cameraPosition - vWPos);
          float glint = pow(max(0.0, sin(hsh * 120.0 + (vd.x * 7.0 + vd.z * 5.0) * 3.0 + uTime * 0.25)), 40.0);
          float near = 1.0 - smoothstep(6.0, 34.0, length(vWPos - cameraPosition));
          totalEmissiveRadiance += vec3(1.0, 0.96, 0.9) * step(0.93, hsh) * dotm * glint * near * 2.4;
        }`
      );
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 0;
  return { mesh, uniforms, glowColor };
}

/* --------------------------------------------------------------------------
   Distant forest
   -------------------------------------------------------------------------- */
function pineGeometry() {
  const parts = [];
  const col = new THREE.Color();
  const tiers = [
    [1.0, 1.25, 0.6],
    [0.8, 1.15, 1.25],
    [0.6, 1.0, 1.85],
    [0.38, 0.85, 2.4],
  ];
  for (const [r, h, y] of tiers) {
    const g = new THREE.ConeGeometry(r, h, 9, 1, true);
    g.translate(0, y + h / 2, 0);
    parts.push(g);
  }
  const trunk = new THREE.CylinderGeometry(0.08, 0.1, 0.8, 6);
  trunk.translate(0, 0.4, 0);
  parts.push(trunk);
  const merged = mergeGeometries(parts.map((g) => g.toNonIndexed()));
  merged.computeVertexNormals();
  const p = merged.attributes.position;
  const colors = new Float32Array(p.count * 3);
  const apexes = tiers.map(([, h, y]) => y + h);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const r = Math.hypot(p.getX(i), p.getZ(i));
    const isApex = r < 0.01 && apexes.some((a) => Math.abs(a - y) < 0.01);
    col.set(y < 0.75 && r < 0.12 ? 0x2a1d14 : isApex ? 0xdfe8f5 : 0x10261b);
    colors.set([col.r, col.g, col.b], i * 3);
  }
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return merged;
}

function createForest(count = 260) {
  const rnd = mulberry32(5);
  const geo = pineGeometry();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const v = new THREE.Vector3();
  const c = new THREE.Color();
  const noise = createNoise2D(11);
  let i = 0;
  while (i < count) {
    const a = rnd() * Math.PI * 2;
    const r = 26 + Math.pow(rnd(), 0.7) * 80;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    // keep the view toward the moon a little clearer
    if (z < -20 && Math.abs(x + 30) < 18 && rnd() > 0.3) continue;
    // keep the camera corridor in front of the tree open (intro + main views)
    if (z > 0) {
      const t = Math.min(Math.max((x * 6 + z * 48) / (6 * 6 + 48 * 48), 0), 1);
      if (Math.hypot(x - 6 * t, z - 48 * t) < 11) continue;
    }
    const drift = noise.fbm(x * 0.045, z * 0.045, 4);
    const y = (drift - 0.45) * 3.2 * smoothstep(9, 30, r) + smoothstep(40, 120, r) * (noise.fbm(x * 0.012, z * 0.012, 3) * 14 - 3) - 0.3;
    const sc = 2.2 + rnd() * 3.4 + r * 0.02;
    v.set(x, y, z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28);
    s.set(sc * (0.85 + rnd() * 0.3), sc, sc * (0.85 + rnd() * 0.3));
    m.compose(v, q, s);
    mesh.setMatrixAt(i, m);
    c.setScalar(0.75 + rnd() * 0.4);
    mesh.setColorAt(i, c);
    i++;
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

/* --------------------------------------------------------------------------
   Victorian lamp posts around the plaza
   -------------------------------------------------------------------------- */
function createLamps(positions) {
  const group = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.45, metalness: 0.7 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xb8904c, roughness: 0.35, metalness: 0.9 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xffe0a8, emissive: 0xffb257, emissiveIntensity: 0, roughness: 0.3 });

  const poleParts = [];
  const base = new THREE.CylinderGeometry(0.16, 0.24, 0.5, 10);
  base.translate(0, 0.25, 0);
  poleParts.push(base);
  const pole = new THREE.CylinderGeometry(0.055, 0.075, 3.4, 8);
  pole.translate(0, 2.1, 0);
  poleParts.push(pole);
  const cap = new THREE.ConeGeometry(0.3, 0.32, 6);
  cap.translate(0, 4.42, 0);
  poleParts.push(cap);
  const poleGeo = mergeGeometries(poleParts);
  const ringGeo = new THREE.CylinderGeometry(0.2, 0.16, 0.08, 6);
  const lanternGeo = new THREE.CylinderGeometry(0.2, 0.15, 0.5, 6);

  const glows = [];
  for (const p of positions) {
    const g = new THREE.Group();
    g.position.copy(p);
    g.add(new THREE.Mesh(poleGeo, iron));
    const ring = new THREE.Mesh(ringGeo, brass);
    ring.position.y = 3.82;
    g.add(ring);
    const lantern = new THREE.Mesh(lanternGeo, glass);
    lantern.position.y = 4.05;
    g.add(lantern);
    const glow = glowSprite(0xffb560, 3.2, 0);
    glow.position.y = 4.05;
    g.add(glow);
    glows.push(glow);
    group.add(g);
  }
  return { group, glows, glass };
}

/* --------------------------------------------------------------------------
   Environment
   -------------------------------------------------------------------------- */
export function createEnvironment(scene, settings) {
  scene.fog = new THREE.FogExp2(HORIZON.clone(), 0.0125);
  scene.background = null;

  const sky = createSky();
  scene.add(sky.mesh);
  const stars = createStars(settings.tier === 'low' ? 1400 : 2600);
  scene.add(stars.object);
  const moon = createMoon(sky.uniforms.uMoonDir.value);
  scene.add(moon);
  const aurora = createAurora();
  scene.add(aurora.mesh);
  const shooting = createShootingStars();
  scene.add(shooting.group);

  const lampPositions = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    lampPositions.push(new THREE.Vector3(Math.cos(a) * 14, 0, Math.sin(a) * 14));
  }
  const ground = createGround(lampPositions);
  scene.add(ground.mesh);
  for (const p of lampPositions) {
    // sit lamps on the terrain
    p.y = groundHeightNear(14) - 0.08;
  }
  const lamps = createLamps(lampPositions);
  scene.add(lamps.group);
  scene.add(createForest(settings.tier === 'low' ? 170 : 260));

  // Lights
  const hemi = new THREE.HemisphereLight(0x5a6f9e, 0x1a1a24, 0.55);
  scene.add(hemi);
  const moonLight = new THREE.DirectionalLight(0xa9bde6, 0.55);
  moonLight.position.copy(sky.uniforms.uMoonDir.value).multiplyScalar(60);
  scene.add(moonLight);

  return {
    sky,
    stars,
    aurora,
    shooting,
    ground,
    lamps,
    hemi,
    moonLight,
    lampPositions,
    setAurora(v) {
      aurora.uniforms.uOpacity.value = v;
      aurora.mesh.visible = v > 0.001;
    },
    update(dt) {
      shooting.update(dt);
    },
  };
}
