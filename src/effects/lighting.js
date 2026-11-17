import * as THREE from 'three';
import gsap from 'gsap';

/** Lighting moods for the tree. Colours are easy to tweak here. */
export const MOODS = {
  gold: {
    label: 'Warm Gold',
    lights: ['#ffc66b', '#ffdca0', '#ffae45', '#fff0c8'],
    point: '#ffad55',
    glow: '#ffa649',
    motes: '#ffd27a',
  },
  classic: {
    label: 'Colourful Christmas',
    lights: ['#ff3d52', '#35d06c', '#4a83ff', '#ffc23a'],
    point: '#ffb47a',
    glow: '#ff9a63',
    motes: '#ffe0a8',
  },
  frost: {
    label: 'Winter Blue',
    lights: ['#a9dcff', '#f4fbff', '#6db7ff', '#d6eeff'],
    point: '#8fc2ff',
    glow: '#6fa8ff',
    motes: '#cde6ff',
  },
};

/**
 * Applies a mood to everything that carries light: the fairy-light shader
 * (colour change moves up the tree), real point lights, the warm glow on the
 * snow and the floating motes.
 */
export function createLightingController({ fairy, pointLights, glowUniforms, moteColor }) {
  let current = 'gold';
  let tl = null;

  const setArr = (arr, hexes) => hexes.forEach((h, i) => arr[i].set(h));
  setArr(fairy.uFrom.value, MOODS.gold.lights);
  setArr(fairy.uTo.value, MOODS.gold.lights);

  function setMood(name, { duration = 2.6 } = {}) {
    const mood = MOODS[name];
    if (!mood || name === current) return false;
    current = name;
    tl?.progress(1).kill();

    // freeze whatever is currently showing as the "from" palette
    for (let i = 0; i < 4; i++) fairy.uFrom.value[i].copy(fairy.uTo.value[i]);
    setArr(fairy.uTo.value, mood.lights);
    fairy.uTransition.value = 0;

    tl = gsap.timeline();
    tl.to(fairy.uTransition, { value: 1, duration, ease: 'sine.inOut' }, 0);
    const pc = new THREE.Color(mood.point);
    for (const l of pointLights) {
      tl.to(l.color, { r: pc.r, g: pc.g, b: pc.b, duration: duration * 0.8, ease: 'sine.inOut' }, 0);
    }
    const gc = new THREE.Color(mood.glow);
    for (const u of glowUniforms) {
      tl.to(u.value, { r: gc.r, g: gc.g, b: gc.b, duration: duration * 0.8, ease: 'sine.inOut' }, 0);
    }
    const mc = new THREE.Color(mood.motes);
    if (moteColor) tl.to(moteColor, { r: mc.r, g: mc.g, b: mc.b, duration, ease: 'sine.inOut' }, 0);
    return true;
  }

  return {
    setMood,
    get mood() {
      return current;
    },
  };
}
