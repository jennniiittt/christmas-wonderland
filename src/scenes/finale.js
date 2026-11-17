import * as THREE from 'three';
import gsap from 'gsap';
import { splitText } from '../utils/helpers.js';
import { TREE } from './christmasTree.js';

/**
 * Scene 5 — The Christmas Finale. The camera rises to the star, golden light
 * drifts upward, snow thickens gently, and the closing words appear.
 */
export function createFinale(app) {
  const { ui, rig, audio, tree, bursts, snowfall } = app;
  const el = {
    root: document.getElementById('finale'),
    title: document.getElementById('finaleTitle'),
    sub: document.querySelector('#finale .finale__sub'),
    again: document.getElementById('anotherWish'),
    back: document.getElementById('finaleReturn'),
  };
  const words = splitText(el.title, 'words');
  let active = false;
  let busy = false;
  let returnView = null;
  let emitAcc = 0;
  let snowBefore = 0.55;
  const starPos = new THREE.Vector3(0, TREE.yTop + 0.75, 0);

  async function start() {
    if (busy || active || app.mode !== 'explore') return;
    busy = true;
    active = true;
    app.setMode('finale');
    returnView = rig.saveView();
    ui.setDockAway(true);
    ui.setHUDVisible(false);
    ui.clearHint();
    audio.duck(0.55, 2);
    audio.play('bell');
    snowBefore = snowfall.uniforms.uIntensity.value;
    gsap.to(snowfall.uniforms.uIntensity, { value: Math.max(snowBefore, 0.8), duration: 4 });
    gsap.to(tree.fairy.uniforms.uIntensity, { value: 0.8, duration: 3 });
    gsap.to(tree.star, { flare: 0.7, duration: 3, ease: 'sine.inOut' });

    rig.setLimits('locked');
    // rise along the tree, then settle with the star framed above the words
    const narrow = window.innerWidth / window.innerHeight < 0.8;
    await rig.flyTo({
      position: new THREE.Vector3(0, 9.5, narrow ? 25 : 17),
      target: new THREE.Vector3(0, 12, 0),
      duration: 3.6,
      ease: 'power2.inOut',
    });

    el.root.hidden = false;
    gsap.set(el.root, { opacity: 1 });
    const tl = gsap.timeline();
    tl.fromTo(words, { opacity: 0, y: 30, filter: 'blur(12px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.8, stagger: 0.18, ease: 'power3.out' })
      .fromTo(el.sub, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 1.4 }, '-=0.8')
      .fromTo([el.again, el.back], { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 1.2, stagger: 0.15 }, '-=0.6');
    audio.play('sparkle');
    busy = false;
  }

  async function end({ thenWish = false } = {}) {
    if (busy || !active) return;
    busy = true;
    audio.play('click');
    await gsap.to(el.root, { opacity: 0, duration: 0.8 }).then();
    el.root.hidden = true;
    gsap.to(snowfall.uniforms.uIntensity, { value: snowBefore, duration: 3 });
    gsap.to(tree.fairy.uniforms.uIntensity, { value: 1, duration: 2 });
    gsap.to(tree.star, { flare: 0, duration: 2 });
    audio.unduck(2.5);
    rig.setLimits('tree');
    await rig.flyTo({ ...returnView, duration: 2.6 });
    active = false;
    busy = false;
    ui.setHUDVisible(true);
    ui.setDockAway(false);
    app.setMode('explore');
    if (thenWish) app.wishes.show();
  }

  const ac = new AbortController();
  el.again.addEventListener('click', () => end({ thenWish: true }), { signal: ac.signal });
  el.back.addEventListener('click', () => end(), { signal: ac.signal });

  /** Rising golden light around the star and up from the tree. */
  function update(dt, t) {
    if (!active) return;
    emitAcc += dt;
    while (emitAcc > 0.07) {
      emitAcc -= 0.07;
      const a = Math.random() * Math.PI * 2;
      const r = 0.6 + Math.random() * 2.6;
      bursts.emit(new THREE.Vector3(Math.cos(a) * r, starPos.y - 2.5 + Math.random() * 2, Math.sin(a) * r), {
        count: 2,
        speed: 0.25,
        gravity: 0.55,
        drag: 0.6,
        life: 3.2,
        size: 0.13,
        colors: [0xffe2a0, 0xfff4d8, 0xffc45c],
      });
      const h = 2 + Math.random() * 10;
      const rr = (1 - (h - TREE.yBase) / (TREE.yTop - TREE.yBase)) * TREE.rBase + 0.8;
      const aa = t * 0.6 + Math.random() * 0.4;
      bursts.emit(new THREE.Vector3(Math.cos(aa) * rr, h, Math.sin(aa) * rr), { count: 1, speed: 0.2, gravity: 0.7, drag: 0.5, life: 3.5, size: 0.1, colors: [0xffd27a] });
    }
  }

  return {
    start,
    end,
    update,
    get active() {
      return active;
    },
    dispose() {
      ac.abort();
    },
  };
}
