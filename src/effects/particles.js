import * as THREE from 'three';
import { mulberry32 } from '../utils/helpers.js';
import { world } from '../core/world.js';

const SPARK_VERT = /* glsl */ `
  attribute float aSize;
  attribute vec4 aColor;
  uniform float uPixelRatio, uPointScale;
  varying vec4 vColor;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPointScale * uPixelRatio / max(-mv.z, 0.05);
    if (aColor.a <= 0.001) gl_PointSize = 0.0;
    gl_Position = projectionMatrix * mv;
  }
`;
const SPARK_FRAG = /* glsl */ `
  varying vec4 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float core = exp(-d * d * 18.0);
    float halo = exp(-d * d * 3.5) * 0.4;
    float a = (core + halo) * vColor.a;
    if (a < 0.004) discard;
    gl_FragColor = vec4((vColor.rgb * (core * 2.2 + halo) + vec3(core * 0.6)) * vColor.a, 1.0);
  }
`;

/**
 * Pooled CPU particle bursts (sparkles, fountains, fireworks). Only live
 * particles are simulated; the buffers are small and updated in place.
 */
export function createBursts(max = 1600) {
  const pos = new Float32Array(max * 3);
  const col = new Float32Array(max * 4);
  const size = new Float32Array(max);
  const vel = new Float32Array(max * 3);
  const life = new Float32Array(max);
  const maxLife = new Float32Array(max);
  const baseSize = new Float32Array(max);
  const drag = new Float32Array(max);
  const grav = new Float32Array(max);
  const twinkle = new Float32Array(max);
  const rgb = new Float32Array(max * 3);
  let cursor = 0;
  let alive = 0;

  const geo = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const aCol = new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage);
  const aSize = new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', aPos);
  geo.setAttribute('aColor', aCol);
  geo.setAttribute('aSize', aSize);

  const mat = new THREE.ShaderMaterial({
    uniforms: { uPixelRatio: world.uniforms.uPixelRatio, uPointScale: world.uniforms.uPointScale },
    vertexShader: SPARK_VERT,
    fragmentShader: SPARK_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 8;

  const tmpC = new THREE.Color();
  const rnd = Math.random;

  /**
   * emit(origin, { count, colors, speed, spread, up, gravity, life, size, drag, shape, radius })
   * shape: 'sphere' | 'fountain' | 'ring' | 'points' (positions array)
   */
  function emit(origin, o = {}) {
    const count = o.count ?? 60;
    const colors = (o.colors ?? [0xffd68a, 0xfff2d0, 0xffb347]).map((c) => tmpC.set(c).toArray());
    for (let n = 0; n < count; n++) {
      const i = cursor;
      cursor = (cursor + 1) % max;
      let dx, dy, dz;
      const sp = (o.speed ?? 2) * (0.35 + rnd() * 0.65);
      if (o.shape === 'fountain') {
        const a = rnd() * Math.PI * 2;
        const r = rnd() * (o.spread ?? 0.35);
        dx = Math.cos(a) * r;
        dz = Math.sin(a) * r;
        dy = 1;
      } else if (o.shape === 'ring') {
        const a = (n / count) * Math.PI * 2;
        dx = Math.cos(a);
        dz = Math.sin(a);
        dy = (rnd() - 0.5) * 0.15;
      } else {
        const u = rnd() * 2 - 1;
        const a = rnd() * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        dx = s * Math.cos(a);
        dy = u + (o.up ?? 0);
        dz = s * Math.sin(a);
      }
      const len = Math.hypot(dx, dy, dz) || 1;
      vel[i * 3] = (dx / len) * sp;
      vel[i * 3 + 1] = (dy / len) * sp;
      vel[i * 3 + 2] = (dz / len) * sp;
      let px = origin.x;
      let py = origin.y;
      let pz = origin.z;
      if (o.points) {
        const p = o.points[n % o.points.length];
        px = p.x;
        py = p.y;
        pz = p.z;
      } else if (o.radius) {
        px += (rnd() - 0.5) * o.radius * 2;
        py += (rnd() - 0.5) * o.radius * 2;
        pz += (rnd() - 0.5) * o.radius * 2;
      }
      pos[i * 3] = px;
      pos[i * 3 + 1] = py;
      pos[i * 3 + 2] = pz;
      const c = colors[(rnd() * colors.length) | 0];
      rgb[i * 3] = c[0];
      rgb[i * 3 + 1] = c[1];
      rgb[i * 3 + 2] = c[2];
      maxLife[i] = life[i] = (o.life ?? 1.6) * (0.6 + rnd() * 0.6);
      baseSize[i] = (o.size ?? 0.12) * (0.5 + rnd() * 0.9);
      drag[i] = o.drag ?? 1.6;
      grav[i] = o.gravity ?? -0.6;
      twinkle[i] = rnd() * 20;
    }
    alive = max;
  }

  function update(dt) {
    if (!alive) return;
    let any = 0;
    for (let i = 0; i < max; i++) {
      if (life[i] <= 0) {
        if (col[i * 4 + 3] !== 0) col[i * 4 + 3] = 0;
        continue;
      }
      any++;
      life[i] -= dt;
      const k = Math.exp(-drag[i] * dt);
      vel[i * 3] *= k;
      vel[i * 3 + 1] = vel[i * 3 + 1] * k + grav[i] * dt;
      vel[i * 3 + 2] *= k;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      const t = Math.max(life[i], 0) / maxLife[i];
      const fade = Math.min(1, t * 3) * Math.min(1, (1 - t) * 10 + 0.2);
      const tw = 0.65 + 0.35 * Math.sin(world.realTime * 18 + twinkle[i]);
      col[i * 4] = rgb[i * 3];
      col[i * 4 + 1] = rgb[i * 3 + 1];
      col[i * 4 + 2] = rgb[i * 3 + 2];
      col[i * 4 + 3] = fade * tw;
      size[i] = baseSize[i] * (0.6 + 0.4 * t);
    }
    alive = any;
    aPos.needsUpdate = true;
    aCol.needsUpdate = true;
    aSize.needsUpdate = true;
  }

  return {
    object: points,
    emit,
    update,
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

/**
 * Ambient golden motes / fireflies drifting around the tree. Fully GPU.
 */
export function createMotes({ count = 220, radius = 9, height = 15, seed = 21 } = {}) {
  const rnd = mulberry32(seed);
  const pos = new Float32Array(count * 3);
  const rand = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const h = rnd();
    const r = (2.5 + rnd() * radius) * (1 - h * 0.55);
    pos[i * 3] = r;
    pos[i * 3 + 1] = 0.4 + h * height;
    pos[i * 3 + 2] = rnd() * Math.PI * 2;
    rand[i * 4] = rnd();
    rand[i * 4 + 1] = rnd();
    rand[i * 4 + 2] = rnd();
    rand[i * 4 + 3] = rnd();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 4));
  const uniforms = {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(0xffd27a) },
    uOpacity: { value: 0 },
    uPixelRatio: world.uniforms.uPixelRatio,
    uPointScale: world.uniforms.uPointScale,
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec4 aRand;
      uniform float uTime, uPixelRatio, uPointScale;
      varying float vA;
      void main() {
        float r = position.x;
        float ang = position.z + uTime * (0.03 + aRand.x * 0.06) * (aRand.y > 0.5 ? 1.0 : -1.0);
        float y = position.y + sin(uTime * (0.3 + aRand.z * 0.4) + aRand.w * 20.0) * 0.6;
        float rr = r + sin(uTime * 0.25 + aRand.x * 12.0) * 0.6;
        vec3 p = vec3(cos(ang) * rr, y, sin(ang) * rr);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float blink = 0.5 + 0.5 * sin(uTime * (0.8 + aRand.w * 1.8) + aRand.z * 40.0);
        vA = blink * blink;
        gl_PointSize = (0.07 + aRand.y * 0.09) * uPointScale * uPixelRatio / -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = (exp(-d * d * 10.0) + exp(-d * d * 3.0) * 0.3) * vA * uOpacity;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uColor * 1.6 * a, 1.0);
      }
    `,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return {
    object: points,
    uniforms,
    update(dt) {
      uniforms.uTime.value += dt;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
