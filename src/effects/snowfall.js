import * as THREE from 'three';
import { mulberry32 } from '../utils/helpers.js';
import { world } from '../core/world.js';

/**
 * GPU snowfall: positions are animated entirely in the vertex shader, so a
 * few thousand flakes cost almost nothing on the CPU. `intensity` controls
 * what fraction of flakes are visible, `swirl` adds a shaken-globe vortex,
 * and `sphereRadius` clips flakes to the inside of a snow globe.
 */
export function createSnowfall({
  count = 3000,
  box = new THREE.Vector3(70, 34, 70),
  center = new THREE.Vector3(0, 0, 0),
  size = 0.14,
  speed = 1,
  sphereRadius = 0,
  seed = 7,
} = {}) {
  const rnd = mulberry32(seed);
  const pos = new Float32Array(count * 3);
  const rand = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rnd() - 0.5) * box.x;
    pos[i * 3 + 1] = rnd() * box.y;
    pos[i * 3 + 2] = (rnd() - 0.5) * box.z;
    rand[i * 4] = rnd();
    rand[i * 4 + 1] = rnd();
    rand[i * 4 + 2] = rnd();
    rand[i * 4 + 3] = rnd();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 4));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, box.y / 2, 0), Math.max(box.x, box.y, box.z));

  const uniforms = {
    uTime: { value: 0 },
    uBoxH: { value: box.y },
    uBox: { value: box.clone() },
    uSize: { value: size },
    uSpeed: { value: speed },
    uIntensity: { value: 0.55 },
    uSwirl: { value: 0 },
    uPhase: { value: 0 },
    uSphere: { value: sphereRadius },
    uWind: { value: new THREE.Vector2(0.35, 0.1) },
    uColor: { value: new THREE.Color(0xeef4ff) },
    uOpacity: { value: 1 },
    uPixelRatio: world.uniforms.uPixelRatio,
    uPointScale: world.uniforms.uPointScale,
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec4 aRand;
      uniform float uTime, uBoxH, uSize, uSpeed, uIntensity, uSwirl, uPhase, uSphere, uPixelRatio, uPointScale;
      uniform vec3 uBox;
      uniform vec2 uWind;
      varying float vAlpha;
      varying float vSoft;
      void main() {
        vec3 p = position;
        float fall = (0.55 + aRand.x * 0.9) * uSpeed;
        float t = uTime;
        p.y = mod(p.y - t * fall, uBoxH);
        float sway = 0.6 + aRand.y * 0.8;
        p.x += sin(t * (0.4 + aRand.z * 0.6) + aRand.w * 30.0) * sway + uWind.x * t * fall;
        p.z += cos(t * (0.35 + aRand.y * 0.5) + aRand.x * 30.0) * sway + uWind.y * t * fall;
        p.x = mod(p.x + uBox.x * 0.5, uBox.x) - uBox.x * 0.5;
        p.z = mod(p.z + uBox.z * 0.5, uBox.z) - uBox.z * 0.5;

        float alpha = 1.0;
        if (uSphere > 0.0) {
          // snow globe: recentre vertically and swirl when shaken
          p.y -= uBoxH * 0.5;
          float ang = uPhase * (0.6 + aRand.x * 0.9) * (1.2 - length(p.xz) / uSphere * 0.6);
          float ca = cos(ang), sa = sin(ang);
          p.xz = mat2(ca, -sa, sa, ca) * p.xz;
          p.y += uSwirl * sin(aRand.w * 6.28 + t * 2.0) * 0.25 * uSphere;
          float r = length(p);
          alpha *= 1.0 - smoothstep(uSphere * 0.86, uSphere * 0.95, r);
        }
        else {
          // fade in near the top of the volume, so flakes never pop in
          alpha *= 1.0 - smoothstep(0.86, 1.0, p.y / uBoxH);
        }
        vAlpha = alpha * step(aRand.w, uIntensity);

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float s = uSize * (0.45 + aRand.z * 1.1);
        gl_PointSize = s * uPointScale * uPixelRatio / max(-mv.z, 0.05);
        vSoft = clamp(gl_PointSize / 26.0, 0.0, 1.0);
        if (vAlpha <= 0.001) gl_PointSize = 0.0;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vAlpha;
      varying float vSoft;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = mix(smoothstep(1.0, 0.35, d), smoothstep(1.0, 0.0, d) * 0.55, vSoft);
        a *= vAlpha * uOpacity;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor * 1.15, a);
      }
    `,
  });

  const points = new THREE.Points(geo, mat);
  points.position.copy(center);
  points.frustumCulled = false;
  points.renderOrder = 5;

  return {
    object: points,
    uniforms,
    update(dt) {
      uniforms.uTime.value += dt;
      if (uniforms.uSwirl.value > 0) {
        uniforms.uPhase.value += dt * uniforms.uSwirl.value * 3.2;
        uniforms.uSwirl.value = Math.max(0, uniforms.uSwirl.value - dt * 0.3);
      }
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
