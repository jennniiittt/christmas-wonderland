import './style.css';
import * as THREE from 'three';
import gsap from 'gsap';
import { world } from './core/world.js';
import { detectCapabilities, TIERS } from './core/quality.js';
import { createRenderer } from './core/renderer.js';
import { createEnvironmentMap } from './core/env.js';
import { CameraRig } from './core/cameraRig.js';
import { createUI } from './ui/ui.js';
import { createEnvironment } from './scenes/environment.js';
import { createChristmasTree, TREE } from './scenes/christmasTree.js';
import { createTrain } from './scenes/train.js';
import { createFinale } from './scenes/finale.js';
import { createSnowfall } from './effects/snowfall.js';
import { createBursts, createMotes } from './effects/particles.js';
import { createLightingController, MOODS } from './effects/lighting.js';
import { createCursorTrail } from './effects/cursorTrail.js';
import { createPicker } from './interactions/picker.js';
import { createPresents } from './interactions/presents.js';
import { createOrnamentInteractions } from './interactions/ornaments.js';
import { createWishes } from './interactions/wishes.js';
import { AudioManager } from './audio/audioManager.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
// Keep cinematic timing in real time even on slow GPUs; only smooth over real hitches (> 1 s).
gsap.ticker.lagSmoothing(1000, 16);
const caps = detectCapabilities();

if (!caps.webgl) {
  startFallback('Your browser could not start 3D graphics, so here is a lighter version of the wonderland.');
} else {
  boot().catch((err) => {
    console.error('[wonderland] failed to start 3D scene', err);
    startFallback('The 3D wonderland could not start on this device, so here is a lighter version.');
  });
}

function startFallback(reason) {
  import('./fallback/fallback2d.js').then((m) => m.startFallback({ reason }));
}

async function boot() {
  const settings = TIERS[caps.tier];
  world.tier = caps.tier;
  world.settings = settings;
  world.reducedMotion = caps.reducedMotion;
  world.coarsePointer = caps.coarse;

  const ac = new AbortController();
  const { signal } = ac;
  const ui = createUI({ signal });
  ui.setProgress(0.03, 'Gathering starlight');

  /* ---------- renderer, scene, camera ---------- */
  const canvas = document.getElementById('scene');
  const gfx = createRenderer(canvas, settings, caps);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 1000);
  const envMap = createEnvironmentMap(gfx.renderer);
  scene.environment = envMap;
  scene.environmentIntensity = 0.4;
  ui.setProgress(0.08, 'Painting the night sky');
  await nextFrame();

  const env = createEnvironment(scene, { tier: caps.tier });
  ui.setProgress(0.15, 'Planting the giant tree');
  await nextFrame();

  const tree = await createChristmasTree({
    settings,
    glowColor: env.ground.glowColor,
    onProgress: (p, label) => ui.setProgress(0.15 + p * 0.6, label),
  });
  scene.add(tree.group);

  const snowfall = createSnowfall({ count: settings.snow });
  scene.add(snowfall.object);
  const motes = createMotes({ count: settings.motes });
  scene.add(motes.object);
  const bursts = createBursts(caps.tier === 'low' ? 1100 : 1700);
  scene.add(bursts.object);
  const train = createTrain();
  scene.add(train.group);
  ui.setProgress(0.82, 'Wrapping the presents');
  await nextFrame();

  const lighting = createLightingController({
    fairy: tree.fairy.uniforms,
    pointLights: tree.pointLights,
    glowUniforms: [env.ground.glowColor],
    moteColor: motes.uniforms.uColor.value,
  });

  const audio = new AudioManager();
  const rig = new CameraRig(camera, canvas);

  /* ---------- app context shared by every feature ---------- */
  const updaters = new Set();
  const app = {
    scene,
    camera,
    rig,
    ui,
    audio,
    bursts,
    tree,
    env,
    snowfall,
    envMap,
    lighting,
    mode: 'loading',
    activeScene: scene,
    pendingFinale: false,
    setMode(m) {
      this.mode = m;
      rig.autoRotateAllowed = m === 'explore';
      rig.setControl(m === 'explore' || m === 'focus' || m === 'globe');
      document.body.dataset.mode = m;
      // the menu is only offered when it can actually be used
      if (!ui.el.dock.hidden) ui.setDockAway(m !== 'explore');
    },
    /** Compile a scene's shaders up front (hidden behind a fade) so it appears without a hitch. */
    async compile(s) {
      try {
        if (gfx.renderer.compileAsync) await gfx.renderer.compileAsync(s, camera);
        else gfx.renderer.compile(s, camera);
      } catch {
        /* optimisation only */
      }
    },
    addUpdater: (fn) => updaters.add(fn),
    removeUpdater: (fn) => updaters.delete(fn),
    setAurora(v, duration = 4) {
      env.aurora.mesh.visible = true;
      gsap.to(env.aurora.uniforms.uOpacity, { value: v, duration, ease: 'sine.inOut', onComplete: () => env.setAurora(v) });
    },
    setActiveScene(s, { near = 0.1, far = 1000 } = {}) {
      this.activeScene = s;
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
      ui.setHUDVisible(false);
      ui.setDockAway(true);
      ui.clearHint();
      this.setMode('globe');
    },
    restoreMainScene(view) {
      this.activeScene = scene;
      camera.near = 0.1;
      camera.far = 1000;
      camera.updateProjectionMatrix();
      rig.setLimits('tree');
      if (view) {
        camera.position.copy(view.position);
        rig.controls.target.copy(view.target);
        camera.lookAt(view.target);
        rig.controls.update();
      }
      ui.setHUDVisible(true);
      ui.setDockAway(false);
      this.setMode('explore');
    },
    onAllMagicFound(restored) {
      app.setAurora(1, restored ? 0.01 : 5);
      if (!restored) {
        ui.toast('The northern lights have awakened for you', 5200);
        if (app.pendingFinale) {
          app.pendingFinale = false;
          setTimeout(() => finale.start(), 500);
        }
      }
    },
  };

  const picker = createPicker({ dom: canvas, camera, ui, signal, activeScene: () => app.activeScene });
  picker.addOccluder(tree.body);
  app.picker = picker;

  const presents = createPresents(app);
  app.presents = presents;
  createOrnamentInteractions(app);
  const wishes = createWishes(app);
  app.wishes = wishes;
  const finale = createFinale(app);
  app.finale = finale;
  const cursor = createCursorTrail(document.getElementById('fx2d'), { signal });

  // secret: touch the star
  let starTouches = 0;
  const STAR_SECRETS = [
    'You touched the star. Somewhere, a reindeer just smiled.',
    'The star hums a little louder. It likes you.',
    'Three times! A wish has been granted to someone who needed it.',
  ];
  picker.register({
    object: tree.star.hit,
    enabled: () => app.mode === 'explore',
    tooltip: 'Touch the star',
    onClick: () => {
      const p = tree.star.group.getWorldPosition(new THREE.Vector3());
      audio.play('sleigh');
      bursts.emit(p, { count: 140, speed: 3.5, life: 2, size: 0.14, gravity: -0.4, colors: [0xffe2a0, 0xfff4d8, 0xffc45c] });
      gsap.timeline().to(tree.star, { flare: 1, duration: 0.3 }).to(tree.star, { flare: 0, duration: 1.8 });
      ui.toast(STAR_SECRETS[starTouches++ % STAR_SECRETS.length]);
    },
  });
  // the train whistles when clicked
  for (const box of train.hitBoxes) {
    picker.register({
      object: box,
      enabled: () => app.mode === 'explore',
      tooltip: 'All aboard!',
      onClick: () => {
        audio.play('sleigh');
        train.whistle();
      },
    });
  }

  presents.restore();

  /* ---------- framing ---------- */
  const fov = camera.fov;
  function defaultView() {
    const aspect = innerWidth / innerHeight;
    const tanH = Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const dv = 11 / tanH;
    const dh = 7.2 / (tanH * aspect);
    const d = Math.max(dv, dh);
    const target = new THREE.Vector3(0, 6.3, 0);
    const position = new THREE.Vector3(0, 3.0, d);
    return { position, target };
  }
  const INTRO = { position: new THREE.Vector3(6, 3.2, 40), target: new THREE.Vector3(-14, 19, -40) };
  camera.position.copy(INTRO.position);
  rig.controls.target.copy(INTRO.target);
  camera.lookAt(INTRO.target);
  rig.setLimits('locked');

  /* ---------- initial "lights off" state for the reveal ---------- */
  gfx.renderer.toneMappingExposure = 0.5;
  tree.fairy.uniforms.uReveal.value = 0;
  tree.frondUniforms.uGlow.value = 0;
  env.ground.uniforms.uGlow.value = 0;
  env.ground.uniforms.uLampGlow.value = 0;
  motes.uniforms.uOpacity.value = 0;
  env.sky.uniforms.uBright.value = 0.75;

  /* ---------- resize ---------- */
  function onResize() {
    const w = innerWidth;
    const h = innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    gfx.setSize(w, h);
    world.uniforms.uPointScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  }
  onResize();
  window.addEventListener('resize', onResize, { signal });

  /* ---------- warm up shaders so the first frames are smooth ---------- */
  ui.setProgress(0.88, 'Lighting the candles');
  await nextFrame();
  try {
    if (gfx.renderer.compileAsync) await gfx.renderer.compileAsync(scene, camera);
    else gfx.renderer.compile(scene, camera);
  } catch {
    /* compile is an optimisation only */
  }
  gfx.render(scene, camera);
  ui.setProgress(0.95, 'Opening the doors');
  if (document.fonts?.ready) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))]);
  ui.setProgress(1, 'Ready');

  /* ---------- render loop ---------- */
  const clock = new THREE.Clock();
  let raf = 0;
  let running = true;
  function loop() {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    world.realTime += dt;
    const sdt = dt * world.timeScale;
    world.time += sdt;
    world.uniforms.uTime.value = world.time;

    if (app.activeScene === scene) {
      env.update(sdt);
      tree.update(sdt, world.time);
      presents.update(sdt, world.time);
      train.update(sdt);
      snowfall.update(sdt);
      motes.update(sdt);
      finale.update(dt, world.realTime);
      wishes.update(world.realTime);
      // snow slowly settles on the branches over the first few minutes
      tree.frondUniforms.uSnow.value = Math.min(0.68, 0.22 + world.time * 0.0022);
    } else {
      globeExp?.update(dt);
    }
    bursts.update(dt);
    for (const fn of updaters) fn(dt);
    rig.update(dt);
    picker.update();
    gfx.render(app.activeScene, camera);
    gfx.monitor(dt);
  }
  function setRunning(on) {
    if (on === running) return;
    running = on;
    if (on) {
      clock.getDelta();
      raf = requestAnimationFrame(loop);
    } else cancelAnimationFrame(raf);
  }
  document.addEventListener('visibilitychange', () => setRunning(!document.hidden), { signal });
  raf = requestAnimationFrame(loop);

  ui.hideLoader();
  app.setMode('intro');
  ui.showIntro();

  /* ---------- sound button ---------- */
  ui.setSoundState(!audio.muted);
  audio.onChange(() => ui.setSoundState(audio.ready && !audio.muted));
  ui.el.sound.addEventListener(
    'click',
    async () => {
      if (!audio.ready) {
        audio.muted = false;
        await audio.init();
        audio.setMuted(false);
      } else audio.toggleMute();
    },
    { signal }
  );

  /* ---------- Scene 1 → 2: enter the wonderland ---------- */
  let entering = false;
  ui.el.enter.addEventListener(
    'click',
    async () => {
      if (entering) return;
      entering = true;
      app.setMode('entering');
      // audio must start inside the user gesture
      audio.init().then(() => {
        audio.play('bell');
        setTimeout(() => audio.play('sleigh'), 2600);
      });
      await ui.hideIntro();
      await enterWonderland();
    },
    { signal }
  );

  async function enterWonderland() {
    const view = defaultView();
    const tl = gsap.timeline();
    tl.to(gfx.renderer, { toneMappingExposure: 0.95, duration: 5, ease: 'sine.inOut' }, 0)
      .to(env.sky.uniforms.uBright, { value: 1, duration: 4 }, 0)
      .to(env.ground.uniforms.uLampGlow, { value: 1, duration: 2.5, ease: 'power2.out' }, 0.6)
      .to(env.lamps.glass, { emissiveIntensity: 2.2, duration: 2.5 }, 0.6)
      .to(
        env.lamps.glows.map((g) => g.material),
        { opacity: 0.85, duration: 2.5, stagger: 0.12 },
        0.6
      )
      .to(tree.fairy.uniforms.uReveal, { value: 1, duration: 3.8, ease: 'power1.inOut' }, 1.4)
      .to(tree.frondUniforms.uGlow, { value: 1, duration: 3.5, ease: 'sine.inOut' }, 1.6)
      .to(env.ground.uniforms.uGlow, { value: 1, duration: 3.5, ease: 'sine.inOut' }, 1.6)
      .to({ k: 0 }, { k: 1, duration: 3, onUpdate() { tree.setReveal(this.targets()[0].k); } }, 2.4)
      .to(motes.uniforms.uOpacity, { value: 1, duration: 3 }, 2.6);
    tree.pointLights.forEach((l, i) => tl.to(l, { intensity: l.userData.max, duration: 2.5, ease: 'sine.inOut' }, 1.8 + i * 0.4));
    // the star ignites last
    tl.add(() => {
      audio.play('magic');
      const p = tree.star.group.getWorldPosition(new THREE.Vector3());
      bursts.emit(p, { count: 160, speed: 4, life: 2.2, size: 0.15, gravity: -0.5, colors: [0xffe2a0, 0xfff4d8, 0xffc45c] });
    }, 5.0)
      .to(tree.star, { level: 1, duration: 1.4, ease: 'power3.out' }, 5.0)
      .to(tree.star, { flare: 1, duration: 0.35, ease: 'power2.out' }, 5.0)
      .to(tree.star, { flare: 0, duration: 2.2, ease: 'power2.inOut' }, 5.4);

    await rig.flyTo({ ...view, duration: 6.2, ease: 'power2.inOut', arc: false });
    rig.setLimits('tree');
    app.setMode('explore');
    ui.showHUD();
    ui.hint(
      caps.coarse
        ? 'Drag to look around · Pinch to zoom · Tap the glowing ornaments and presents'
        : 'Drag to look around · Scroll to zoom · Click the glowing ornaments and presents',
      7000
    );
  }

  /* ---------- Scene 4: the Christmas magic playground ---------- */
  let globeExp = null;
  let globeLoading = false;
  async function openGlobe() {
    if (globeLoading || app.mode !== 'explore') return;
    if (!globeExp) {
      globeLoading = true;
      ui.toast('Fetching the snow globe…', 1500);
      const { createGlobeExperience } = await import('./scenes/globeExperience.js');
      globeExp = createGlobeExperience(app);
      globeLoading = false;
    }
    globeExp.enter();
  }

  ui.el.dock.addEventListener(
    'click',
    (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'lights') {
        if (app.mode === 'explore') ui.toggleLights();
        return;
      }
      if (app.mode !== 'explore') return;
      ui.closeLights();
      audio.play('click');
      if (action === 'wish') wishes.show();
      else if (action === 'presents') presents.tour();
      else if (action === 'globe') openGlobe();
      else if (action === 'finale') finale.start();
    },
    { signal }
  );

  // lighting moods
  const moodButtons = [...ui.el.lights.querySelectorAll('[data-mood]')];
  for (const b of moodButtons) {
    b.addEventListener(
      'click',
      () => {
        const mood = b.dataset.mood;
        if (lighting.setMood(mood)) {
          audio.play('sparkle');
          ui.toast(`${MOODS[mood].label}`, 2200);
        }
        moodButtons.forEach((o) => o.setAttribute('aria-checked', String(o === b)));
      },
      { signal }
    );
  }
  const snowSlider = document.getElementById('snowSlider');
  const applySnow = () => {
    const v = Number(snowSlider.value) / 100;
    snowfall.uniforms.uIntensity.value = v * 0.98;
    snowSlider.style.setProperty('--v', `${snowSlider.value}%`);
  };
  snowSlider.addEventListener('input', applySnow, { signal });
  applySnow();
  const musicToggle = document.getElementById('musicToggle');
  musicToggle.addEventListener('change', () => audio.setMusic(musicToggle.checked), { signal });

  /* ---------- cleanup (HMR / teardown) ---------- */
  function destroy() {
    cancelAnimationFrame(raf);
    ac.abort();
    rig.dispose();
    audio.dispose();
    wishes.dispose();
    finale.dispose();
    globeExp?.dispose();
    snowfall.dispose();
    motes.dispose();
    bursts.dispose();
    cursor.setEnabled(false);
    gsap.globalTimeline.clear();
    scene.traverse((o) => {
      o.geometry?.dispose?.();
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      mats.forEach((m) => m.dispose());
    });
    envMap.dispose();
    gfx.dispose();
  }
  if (import.meta.hot) import.meta.hot.dispose(destroy);
  if (import.meta.env.DEV) window.__wonderland = { app, destroy, TREE };
}
