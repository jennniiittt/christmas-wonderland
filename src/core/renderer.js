import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { world } from './world.js';

/**
 * Renderer + post-processing chain. Always renders through the composer so
 * colour management (ACES tone mapping, sRGB output) is identical on every
 * quality tier; bloom is only added where the GPU can afford it.
 */
export function createRenderer(canvas, settings, caps) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
    stencil: false,
    alpha: false,
  });
  renderer.setClearColor(0x060b18, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.55;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  let pixelRatio = Math.min(window.devicePixelRatio || 1, settings.pixelRatio);
  renderer.setPixelRatio(pixelRatio);

  const size = new THREE.Vector2(window.innerWidth, window.innerHeight);
  const rt = new THREE.WebGLRenderTarget(size.x * pixelRatio, size.y * pixelRatio, {
    type: THREE.HalfFloatType,
    samples: caps.webgl2 ? settings.msaa : 0,
  });
  const composer = new EffectComposer(renderer, rt);
  const renderPass = new RenderPass(null, null);
  composer.addPass(renderPass);

  let bloomPass = null;
  if (settings.bloom) {
    bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.72, 0.5, 0.88);
    composer.addPass(bloomPass);
  }
  composer.addPass(new OutputPass());

  function setSize(w, h) {
    size.set(w, h);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(w, h);
    world.uniforms.uPixelRatio.value = pixelRatio;
  }

  function setPixelRatio(pr) {
    pixelRatio = pr;
    renderer.setPixelRatio(pr);
    setSize(size.x, size.y);
  }

  function render(scene, camera) {
    renderPass.scene = scene;
    renderPass.camera = camera;
    composer.render();
  }

  /** Adaptive quality: drop resolution if frame rate is poor for a while. */
  const perf = { acc: 0, frames: 0, slow: 0, downgraded: 0 };
  function monitor(dt) {
    perf.acc += dt;
    perf.frames++;
    if (perf.acc < 2) return;
    const fps = perf.frames / perf.acc;
    perf.acc = 0;
    perf.frames = 0;
    if (document.hidden) return;
    perf.slow = fps < 38 ? perf.slow + 1 : 0;
    if (perf.slow >= 2 && pixelRatio > 0.75 && perf.downgraded < 3) {
      perf.slow = 0;
      perf.downgraded++;
      setPixelRatio(Math.max(0.75, pixelRatio - 0.25));
      if (bloomPass && perf.downgraded >= 3) bloomPass.enabled = false;
    }
  }

  setSize(window.innerWidth, window.innerHeight);

  return {
    renderer,
    composer,
    bloomPass,
    setSize,
    render,
    monitor,
    get pixelRatio() {
      return pixelRatio;
    },
    dispose() {
      composer.dispose?.();
      rt.dispose();
      renderer.dispose();
    },
  };
}
