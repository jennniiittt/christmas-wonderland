import * as THREE from 'three';
import gsap from 'gsap';
import { createSnowGlobe } from './snowGlobe.js';
import { createSnowfall } from '../effects/snowfall.js';
import { mulberry32, makeCanvas, canvasTexture, disposeObject } from '../utils/helpers.js';
import { world } from '../core/world.js';

/**
 * "Snow Globe" experience: a large globe resting on a dark walnut table in a
 * candle-lit room. Tap it to step inside the miniature village of Winterbrook.
 * Lazy-loaded the first time it is opened.
 */
export function createGlobeExperience(app) {
  const { rig, ui, picker, audio, camera } = app;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050913);
  scene.fog = new THREE.Fog(0x050913, 5, 16);
  scene.environment = app.envMap;
  scene.environmentIntensity = 0.5;

  const globe = createSnowGlobe({ detail: 'full' });
  scene.add(globe.group);

  // table
  const [c, ctx] = makeCanvas(512);
  const g = ctx.createRadialGradient(256, 256, 10, 256, 256, 256);
  g.addColorStop(0, '#4a2f1d');
  g.addColorStop(0.45, '#2a1a10');
  g.addColorStop(1, '#0a0705');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  ctx.globalAlpha = 0.07;
  for (let i = 0; i < 90; i++) {
    ctx.strokeStyle = i % 2 ? '#000' : '#7a5236';
    ctx.beginPath();
    ctx.moveTo(0, i * 6 + Math.sin(i) * 4);
    ctx.bezierCurveTo(170, i * 6 + 8, 340, i * 6 - 8, 512, i * 6 + Math.cos(i) * 4);
    ctx.stroke();
  }
  const table = new THREE.Mesh(
    new THREE.CircleGeometry(40, 64),
    new THREE.MeshStandardMaterial({ map: canvasTexture(c), roughness: 0.4, metalness: 0.1, envMapIntensity: 0.25 })
  );
  table.rotation.x = -Math.PI / 2;
  table.position.y = -1.335;
  scene.add(table);

  // candle-light bokeh in the background
  const rnd = mulberry32(17);
  const n = 70;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const cc = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const a = Math.PI * (0.15 + rnd() * 0.7) + Math.PI;
    const r = 9 + rnd() * 8;
    pos.set([Math.cos(a) * r, -0.6 + rnd() * 3.2, Math.sin(a) * r], i * 3);
    cc.set([0xffb257, 0xffd39a, 0xff8a5a, 0xa8c8ff][(rnd() * 4) | 0]).multiplyScalar(0.25 + rnd() * 0.35);
    col.set([cc.r, cc.g, cc.b], i * 3);
    size[i] = 0.18 + rnd() * 0.45;
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  bg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  bg.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const bokeh = new THREE.Points(
    bg,
    new THREE.ShaderMaterial({
      uniforms: { uTime: world.uniforms.uTime, uPixelRatio: world.uniforms.uPixelRatio, uPointScale: world.uniforms.uPointScale },
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float aSize; uniform float uTime, uPixelRatio, uPointScale; varying vec3 vC;
        void main(){
          vC = color * (0.75 + 0.25 * sin(uTime * 0.8 + position.x * 3.0));
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uPointScale * uPixelRatio / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vC;
        void main(){
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.82, d) * 0.55 + smoothstep(1.0, 0.0, d) * 0.15;
          gl_FragColor = vec4(vC * a, 1.0);
        }`,
    })
  );
  scene.add(bokeh);

  // gentle snow drifting past the window behind
  const outsideSnow = createSnowfall({ count: 500, box: new THREE.Vector3(26, 10, 6), center: new THREE.Vector3(0, -2, -9), size: 0.06, speed: 0.5, seed: 12 });
  outsideSnow.uniforms.uIntensity.value = 0.9;
  outsideSnow.uniforms.uOpacity.value = 0.5;
  scene.add(outsideSnow.object);

  // lighting
  scene.add(new THREE.HemisphereLight(0x5c6f9a, 0x1a0f08, 0.5));
  const key = new THREE.SpotLight(0xffc995, 40, 12, 0.6, 0.6, 1.5);
  key.position.set(2.2, 4.5, 3);
  key.target.position.set(0, -0.6, 0);
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x9db8ff, 0.6);
  rim.position.set(-3, 2, -4);
  scene.add(rim);

  /* ---------- state ---------- */
  const OUTSIDE = { position: new THREE.Vector3(0, 0.45, 3.9), target: new THREE.Vector3(0, -0.2, 0) };
  const INSIDE = { position: new THREE.Vector3(0.04, -0.2, 0.74), target: new THREE.Vector3(0, -0.24, 0) };
  let mode = 'off';
  let busy = false;
  let compiled = false;
  let returnView = null;
  const el = {
    root: document.getElementById('globeUI'),
    hint: document.getElementById('globeHint'),
    shake: document.getElementById('globeShake'),
    leave: document.getElementById('globeLeave'),
    back: document.getElementById('globeBack'),
  };

  const shake = () => {
    audio.play('shake');
    globe.shake();
    if (mode === 'outside') {
      const gg = globe.group;
      gsap.fromTo(gg.rotation, { z: 0 }, { z: 0.08, duration: 0.09, yoyo: true, repeat: 7, ease: 'sine.inOut', onComplete: () => (gg.rotation.z = 0) });
    }
  };

  async function stepInside() {
    if (busy || mode !== 'outside') return;
    busy = true;
    mode = 'entering';
    audio.play('magic');
    el.hint.textContent = '';
    rig.setLimits('locked');
    const fade = { v: 0 };
    gsap.to(fade, { v: 1, duration: 1.4, delay: 0.9, ease: 'power2.inOut', onUpdate: () => globe.setInside(fade.v) });
    await rig.flyTo({ ...INSIDE, duration: 2.6, ease: 'power3.inOut' });
    rig.setLimits('village');
    rig.controls.enabled = true;
    mode = 'inside';
    el.leave.hidden = false;
    el.hint.textContent = 'Welcome to Winterbrook — drag to look around';
    busy = false;
  }

  async function leaveVillage() {
    if (busy || mode !== 'inside') return;
    busy = true;
    mode = 'leaving';
    el.leave.hidden = true;
    rig.setLimits('locked');
    const fade = { v: 1 };
    gsap.to(fade, { v: 0, duration: 1.2, ease: 'power2.inOut', onUpdate: () => globe.setInside(fade.v) });
    await rig.flyTo({ ...OUTSIDE, duration: 2.2 });
    rig.setLimits('globe');
    rig.controls.enabled = true;
    mode = 'outside';
    el.hint.textContent = world.coarsePointer ? 'Tap the globe to step inside the village' : 'Click the globe to step inside the village';
    busy = false;
  }

  const unregister = picker.register({
    object: globe.hit,
    enabled: () => mode === 'outside' && !busy,
    tooltip: 'Step inside Winterbrook',
    onClick: stepInside,
  });

  async function enter() {
    if (busy) return;
    busy = true;
    returnView = rig.saveView();
    audio.play('whoosh');
    await ui.fadeOut(0.8);
    if (!compiled) {
      await app.compile(scene);
      compiled = true;
    }
    app.setActiveScene(scene, { near: 0.01, far: 60 });
    globe.setInside(0);
    camera.position.copy(OUTSIDE.position).add(new THREE.Vector3(1.8, 0.8, 2.2));
    rig.controls.target.copy(OUTSIDE.target);
    camera.lookAt(OUTSIDE.target);
    el.root.hidden = false;
    el.leave.hidden = true;
    el.hint.textContent = world.coarsePointer ? 'Tap the globe to step inside the village' : 'Click the globe to step inside the village';
    gsap.fromTo(el.root, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 1, delay: 0.6 });
    // let the first frame of the new scene render before revealing it
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    ui.fadeIn(1.2);
    rig.setLimits('locked');
    await rig.flyTo({ ...OUTSIDE, duration: 2.2 });
    rig.setLimits('globe');
    rig.controls.enabled = true;
    rig.autoRotateAllowed = true;
    mode = 'outside';
    busy = false;
  }

  async function exit() {
    if (busy) return;
    busy = true;
    audio.play('whoosh');
    await gsap.to(el.root, { opacity: 0, duration: 0.4 }).then();
    el.root.hidden = true;
    await ui.fadeOut(0.8);
    mode = 'off';
    globe.setInside(0);
    app.restoreMainScene(returnView);
    await ui.fadeIn(1.1);
    busy = false;
  }

  const ac = new AbortController();
  el.shake.addEventListener('click', shake, { signal: ac.signal });
  el.leave.addEventListener('click', leaveVillage, { signal: ac.signal });
  el.back.addEventListener('click', exit, { signal: ac.signal });

  function update(dt) {
    if (mode === 'off') return;
    globe.update(dt);
    outsideSnow.update(dt);
  }

  return {
    scene,
    enter,
    exit,
    update,
    get active() {
      return mode !== 'off';
    },
    dispose() {
      ac.abort();
      unregister();
      globe.dispose();
      outsideSnow.dispose();
      disposeObject(scene);
    },
  };
}
