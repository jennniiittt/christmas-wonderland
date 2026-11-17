import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createSnowfall } from '../effects/snowfall.js';
import { mulberry32, glowSprite, makeCanvas, canvasTexture, disposeObject, glowTexture } from '../utils/helpers.js';
import { world } from '../core/world.js';

/* --------------------------------------------------------------------------
   Glass
   -------------------------------------------------------------------------- */
function glassMaterial(side, strength = 1) {
  return new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 1 }, uStrength: { value: strength } },
    transparent: true,
    depthWrite: false,
    side,
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV;
      void main(){
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uOpacity, uStrength;
      varying vec3 vN; varying vec3 vV;
      void main(){
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        float f = pow(1.0 - abs(dot(n, vV)), 2.4);
        vec3 r = reflect(-vV, n);
        float spec = pow(max(dot(r, normalize(vec3(0.45, 0.6, 0.65))), 0.0), 90.0) * 1.8
                   + pow(max(dot(r, normalize(vec3(-0.6, 0.25, 0.75))), 0.0), 18.0) * 0.18
                   + smoothstep(0.985, 1.0, dot(r, normalize(vec3(0.7, 0.2, 0.68)))) * 0.6;
        vec3 col = mix(vec3(0.5, 0.62, 0.9), vec3(1.0, 0.86, 0.62), 0.35) * f * 0.75 + vec3(1.0, 0.96, 0.88) * spec;
        float a = (0.03 + f * 0.5 + spec) * uOpacity * uStrength;
        gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
      }`,
  });
}

/* --------------------------------------------------------------------------
   Village pieces
   -------------------------------------------------------------------------- */
function prism(w, h, d) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, h);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  return g;
}

const HOUSE_COLORS = [0x8c2b2b, 0xe7dcc3, 0x56705c, 0x2c3e66, 0xb88a4a, 0x7a4d63];

function createHouse(mats, { w, h, d, color }) {
  const g = new THREE.Group();
  const wallMat = mats.walls[color % mats.walls.length];
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
  body.position.y = h / 2;
  g.add(body);
  const roofH = w * 0.55;
  const roof = new THREE.Mesh(prism(w * 1.18, roofH, d * 1.12), mats.roof);
  roof.position.y = h;
  g.add(roof);
  const snow = new THREE.Mesh(prism(w * 1.24, roofH * 1.02, d * 1.16), mats.snow);
  snow.position.y = h + roofH * 0.08;
  snow.scale.set(1, 0.94, 1);
  g.add(snow);
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(w * 0.16, roofH * 0.8, w * 0.16), mats.brick);
  chimney.position.set(w * 0.25, h + roofH * 0.55, -d * 0.15);
  g.add(chimney);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(w * 0.2, roofH * 0.08, w * 0.2), mats.snow);
  cap.position.set(w * 0.25, h + roofH * 0.97, -d * 0.15);
  g.add(cap);
  // glowing windows and door
  const win = new THREE.PlaneGeometry(w * 0.2, h * 0.26);
  for (const x of [-w * 0.27, w * 0.27]) {
    const m = new THREE.Mesh(win, mats.window);
    m.position.set(x, h * 0.6, d / 2 + 0.001);
    g.add(m);
  }
  const door = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.2, h * 0.45), mats.door);
  door.position.set(0, h * 0.22, d / 2 + 0.001);
  g.add(door);
  const side = new THREE.Mesh(win, mats.window);
  side.position.set(w / 2 + 0.001, h * 0.6, 0);
  side.rotation.y = Math.PI / 2;
  g.add(side);
  g.userData.chimneyTop = new THREE.Vector3(w * 0.25, h + roofH * 1.02, -d * 0.15);
  return g;
}

let pineGeoCache = null;
function tinyPineGeometry() {
  if (pineGeoCache) return pineGeoCache;
  const parts = [];
  [
    [0.5, 0.55, 0.15],
    [0.38, 0.48, 0.42],
    [0.25, 0.4, 0.68],
  ].forEach(([r, h, y]) => {
    const c = new THREE.ConeGeometry(r, h, 8, 3);
    c.translate(0, y + h / 2, 0);
    parts.push(c.toNonIndexed());
  });
  const t = new THREE.CylinderGeometry(0.05, 0.06, 0.2, 6);
  t.translate(0, 0.1, 0);
  parts.push(t.toNonIndexed());
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  const col = new Float32Array(g.attributes.position.count * 3);
  const p = g.attributes.position;
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getX(i), p.getZ(i));
    // snow-capped tips: the apex of each tier is white, fading into green
    // with 3 height segments only the top band fades from white to green
    c.set(p.getY(i) < 0.16 && r < 0.07 ? 0x3a2618 : r < 0.005 ? 0xf2f6fc : 0x123d24);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  pineGeoCache = g;
  return g;
}

function createLittleTree(scale, withLights, rnd) {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(tinyPineGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }));
  g.add(mesh);
  let lights = null;
  if (withLights) {
    const pos = [];
    const col = [];
    const c = new THREE.Color();
    for (let i = 0; i < 70; i++) {
      const t = rnd();
      const y = 0.18 + t * 0.85;
      const r = (1 - t) * 0.48 + 0.02;
      const a = rnd() * Math.PI * 2;
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
      c.set([0xffc66b, 0xff5a6a, 0x7fd0ff, 0xfff0c8][i % 4]);
      col.push(c.r * 2, c.g * 2, c.b * 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    lights = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.06, vertexColors: true, map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    g.add(lights);
    const star = glowSprite(0xffe0a0, 0.35, 1);
    star.position.y = 1.12;
    g.add(star);
  }
  g.scale.setScalar(scale);
  return { group: g, lights };
}

function plaqueTexture(text) {
  const [c, ctx] = makeCanvas(512, 128);
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#e9cf8f');
  g.addColorStop(1, '#a87c35');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = 'rgba(80,50,10,0.6)';
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, 492, 108);
  ctx.fillStyle = '#4a2f0c';
  ctx.font = 'italic 56px "Cormorant Garamond", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 68);
  return canvasTexture(c);
}

/* --------------------------------------------------------------------------
   Snow globe
   -------------------------------------------------------------------------- */
/**
 * detail 'full' → the grand globe with a whole village (Snow Globe experience)
 * detail 'mini' → a little keepsake globe (Midnight present)
 */
export function createSnowGlobe({ detail = 'full' } = {}) {
  const full = detail === 'full';
  pineGeoCache = null; // every globe owns (and later disposes) its own geometry
  const rnd = mulberry32(full ? 77 : 78);
  const group = new THREE.Group();
  const R = 1;

  const mats = {
    walls: HOUSE_COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 })),
    roof: new THREE.MeshStandardMaterial({ color: 0x2b2f3a, roughness: 0.8 }),
    snow: new THREE.MeshStandardMaterial({ color: 0xf1f5fb, roughness: 0.9 }),
    brick: new THREE.MeshStandardMaterial({ color: 0x6b3a2a, roughness: 0.9 }),
    window: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.45, 0.62) }),
    door: new THREE.MeshStandardMaterial({ color: 0x5a1a1a, roughness: 0.7 }),
  };

  // snowy ground inside the globe
  const groundY = -0.42;
  const groundGeo = new THREE.CircleGeometry(Math.sqrt(R * R - groundY * groundY) - 0.02, 64, 0, Math.PI * 2);
  const gp = groundGeo.attributes.position;
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i);
    const y = gp.getY(i);
    const r = Math.hypot(x, y);
    gp.setZ(i, Math.cos(r * 2.2) * 0.05 + Math.sin(x * 9) * Math.cos(y * 7) * 0.012);
  }
  groundGeo.computeVertexNormals();
  groundGeo.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ color: 0xe6edf8, roughness: 0.95 }));
  ground.position.y = groundY;

  const village = new THREE.Group();
  village.add(ground);
  const chimneys = [];
  const treeLights = [];

  if (full) {
    const ring = [
      [0.0, 0.55, 0.22, 0.17, 0.16],
      [1.05, 0.58, 0.18, 0.15, 0.15],
      [2.1, 0.56, 0.2, 0.19, 0.16],
      [3.15, 0.55, 0.24, 0.16, 0.18],
      [4.2, 0.6, 0.19, 0.15, 0.15],
      [5.25, 0.56, 0.2, 0.17, 0.16],
    ];
    ring.forEach(([a, r, w, h, d], i) => {
      const house = createHouse(mats, { w, h, d, color: i });
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      house.position.set(x, groundY + Math.cos(r * 2.2) * 0.05 - 0.005, z);
      house.lookAt(0, house.position.y, 0);
      village.add(house);
      chimneys.push(house);
    });
    const centre = createLittleTree(0.32, true, rnd);
    centre.group.position.set(0, groundY + 0.04, 0);
    village.add(centre.group);
    treeLights.push(centre.lights);
    for (let i = 0; i < 14; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 0.3 + rnd() * 0.5;
      if (Math.abs(r - 0.56) < 0.08) continue;
      const t = createLittleTree(0.1 + rnd() * 0.1, false, rnd);
      t.group.position.set(Math.cos(a) * r, groundY + Math.cos(r * 2.2) * 0.05 - 0.01, Math.sin(a) * r);
      village.add(t.group);
    }
    // frozen pond
    const pond = new THREE.Mesh(
      new THREE.CircleGeometry(0.12, 32),
      new THREE.MeshStandardMaterial({ color: 0x7a9cc8, metalness: 0.9, roughness: 0.08 })
    );
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(0.28, groundY + 0.035, 0.24);
    village.add(pond);
    // lamp posts with glow
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + Math.PI / 2 + Math.PI / 5;
      const r = 0.24;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.006, 0.14, 6), new THREE.MeshStandardMaterial({ color: 0x1b1b22, metalness: 0.6, roughness: 0.4 }));
      const base = new THREE.Vector3(Math.cos(a) * r, groundY + Math.cos(r * 2.2) * 0.05, Math.sin(a) * r);
      post.position.copy(base).add(new THREE.Vector3(0, 0.07, 0));
      village.add(post);
      const glow = glowSprite(0xffb560, 0.12, 0.9);
      glow.position.copy(base).add(new THREE.Vector3(0, 0.15, 0));
      village.add(glow);
    }
    const warm = new THREE.PointLight(0xffb36a, 1.2, 1.4, 1.2);
    warm.position.set(0, groundY + 0.35, 0);
    village.add(warm);
  } else {
    const house = createHouse(mats, { w: 0.34, h: 0.26, d: 0.28, color: 1 });
    house.position.set(-0.12, groundY + 0.03, -0.05);
    house.rotation.y = 0.35;
    village.add(house);
    chimneys.push(house);
    const t = createLittleTree(0.42, true, rnd);
    t.group.position.set(0.32, groundY + 0.03, 0.12);
    village.add(t.group);
    treeLights.push(t.lights);
    for (const [x, z, s] of [
      [-0.45, 0.25, 0.2],
      [0.05, -0.5, 0.24],
      [0.45, -0.3, 0.17],
    ]) {
      const p = createLittleTree(s, false, rnd);
      p.group.position.set(x, groundY + 0.02, z);
      village.add(p.group);
    }
    const warm = new THREE.PointLight(0xffb36a, 1.5, 2, 1.2);
    warm.position.set(0, 0, 0.4);
    village.add(warm);
  }
  group.add(village);

  // snow inside (clipped to the sphere)
  const snow = createSnowfall({
    count: full ? 1100 : 380,
    box: new THREE.Vector3(2 * R, 2 * R, 2 * R),
    size: full ? 0.022 : 0.03,
    speed: 0.11,
    sphereRadius: R * 0.98,
    seed: full ? 31 : 32,
  });
  snow.uniforms.uIntensity.value = 1;
  snow.uniforms.uWind.value.set(0.05, 0.02);
  group.add(snow.object);

  // glass (back faces first, then front faces)
  const glassBackMat = glassMaterial(THREE.BackSide, 0.45);
  const glassFrontMat = glassMaterial(THREE.FrontSide, 1);
  const sphereGeo = new THREE.SphereGeometry(R, 64, 48);
  const glassBack = new THREE.Mesh(sphereGeo, glassBackMat);
  glassBack.renderOrder = 9;
  const glassFront = new THREE.Mesh(sphereGeo, glassFrontMat);
  glassFront.renderOrder = 10;
  group.add(glassBack, glassFront);

  // stars visible from inside the globe
  let innerStars = null;
  if (full) {
    const pos = [];
    for (let i = 0; i < 260; i++) {
      const v = new THREE.Vector3(rnd() * 2 - 1, rnd() * 0.9 + 0.1, rnd() * 2 - 1).normalize().multiplyScalar(0.97);
      pos.push(v.x, v.y, v.z);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    innerStars = new THREE.Points(
      sg,
      new THREE.PointsMaterial({ color: 0xfff4dc, size: 0.012, map: glowTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    group.add(innerStars);
  }

  // wooden base with gold trim and a plaque
  const wood = new THREE.MeshStandardMaterial({ color: 0x2b1a10, roughness: 0.45, metalness: 0.1 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd8b26a, roughness: 0.25, metalness: 1 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.98, 0.44, 64), wood);
  base.position.y = -1.06;
  group.add(base);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.04, 0.07, 64), wood);
  foot.position.y = -1.3;
  group.add(foot);
  const ringTop = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.028, 12, 96), gold);
  ringTop.rotation.x = Math.PI / 2;
  ringTop.position.y = -0.84;
  group.add(ringTop);
  const ringBot = new THREE.Mesh(new THREE.TorusGeometry(0.985, 0.022, 12, 96), gold);
  ringBot.rotation.x = Math.PI / 2;
  ringBot.position.y = -1.27;
  group.add(ringBot);
  if (full) {
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.155), new THREE.MeshStandardMaterial({ map: plaqueTexture('Winterbrook'), metalness: 0.7, roughness: 0.35 }));
    plaque.position.set(0, -1.07, 0.9);
    plaque.rotation.x = -0.38;
    group.add(plaque);
  }

  const hit = new THREE.Mesh(new THREE.SphereGeometry(R * 1.05, 16, 12), new THREE.MeshBasicMaterial({ visible: false }));
  group.add(hit);

  // chimney smoke
  const smoke = [];
  const smokeMat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xc8d0dc, transparent: true, opacity: 0, depthWrite: false });
  for (const house of chimneys) {
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Sprite(smokeMat.clone());
      s.userData = { house, t: i / 4 };
      village.add(s);
      smoke.push(s);
    }
  }

  const tmp = new THREE.Vector3();
  let inside = 0;
  function update(dt) {
    snow.update(dt);
    for (const s of smoke) {
      s.userData.t = (s.userData.t + dt * 0.18) % 1;
      const t = s.userData.t;
      const house = s.userData.house;
      tmp.copy(house.userData.chimneyTop).applyMatrix4(house.matrix);
      s.position.set(tmp.x + Math.sin(t * 6 + tmp.x * 20) * 0.02 + t * 0.04, tmp.y + t * 0.32, tmp.z);
      s.scale.setScalar(0.04 + t * 0.14);
      s.material.opacity = Math.sin(t * Math.PI) * 0.22;
    }
    for (const l of treeLights) {
      if (l) l.material.size = 0.06 * (0.85 + 0.15 * Math.sin(world.realTime * 3));
    }
  }

  return {
    group,
    village,
    snow,
    hit,
    glass: [glassFrontMat, glassBackMat],
    update,
    shake() {
      snow.uniforms.uSwirl.value = 1;
    },
    /** 0 = viewed from outside, 1 = standing inside the village */
    setInside(v) {
      inside = v;
      glassFrontMat.uniforms.uOpacity.value = 1 - v;
      glassBackMat.uniforms.uOpacity.value = 1 - v;
      if (innerStars) innerStars.material.opacity = v;
    },
    get inside() {
      return inside;
    },
    dispose() {
      snow.dispose();
      disposeObject(group);
    },
  };
}
