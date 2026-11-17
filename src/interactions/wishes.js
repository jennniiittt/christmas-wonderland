import * as THREE from 'three';
import gsap from 'gsap';
import { glowSprite } from '../utils/helpers.js';

const STORAGE_KEY = 'cw-wishes-v1';
const MAX_STARS = 40;

/**
 * MAKE A WISH — the typed wish dissolves into golden particles, gathers into
 * a single glowing light, and rises into the night sky where it stays as a
 * new star (remembered on this device for the next visit).
 */
export function createWishes(app) {
  const { ui, audio, rig, scene, bursts, camera } = app;
  const el = {
    panel: document.getElementById('wishPanel'),
    form: document.getElementById('wishForm'),
    input: document.getElementById('wishInput'),
    cancel: document.getElementById('wishCancel'),
    star: document.querySelector('#wishPanel .wish__star'),
    submit: document.querySelector('#wishForm button'),
  };
  const sky = new THREE.Group();
  sky.name = 'wish-stars';
  scene.add(sky);
  const stars = [];
  let open = false;
  let sending = false;

  function addSkyStar(dir, { animate = false } = {}) {
    const s = glowSprite(0xfff0cf, 9, animate ? 0 : 0.9);
    s.position.copy(dir).multiplyScalar(300);
    s.userData.phase = Math.random() * 10;
    sky.add(s);
    stars.push(s);
    while (stars.length > MAX_STARS) {
      const old = stars.shift();
      sky.remove(old);
      old.material.dispose();
    }
    if (animate) {
      s.userData.animating = true;
      gsap.fromTo(s.scale, { x: 40, y: 40 }, { x: 9, y: 9, duration: 2.4, ease: 'power3.out', onComplete: () => (s.userData.animating = false) });
      gsap.to(s.material, { opacity: 0.95, duration: 0.6 });
    }
    return s;
  }

  function loadStars() {
    let saved = [];
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      saved = [];
    }
    for (const w of saved.slice(-MAX_STARS)) {
      if (Array.isArray(w.d) && w.d.length === 3) addSkyStar(new THREE.Vector3(...w.d).normalize());
    }
  }
  function saveWish(text, dir) {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      saved.push({ t: text.slice(0, 80), d: dir.toArray().map((n) => +n.toFixed(4)), at: Date.now() });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved.slice(-MAX_STARS)));
    } catch {
      /* ignore */
    }
  }
  loadStars();

  function show() {
    if (open || app.mode !== 'explore') return;
    open = true;
    app.setMode('wish');
    ui.setDockAway(true);
    el.panel.hidden = false;
    el.panel.classList.remove('is-sending');
    el.input.value = '';
    el.submit.disabled = false;
    gsap.fromTo(el.panel, { opacity: 0 }, { opacity: 1, duration: 0.8, ease: 'power2.out' });
    gsap.fromTo(el.panel.children, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 1, stagger: 0.08, ease: 'power3.out' });
    audio.play('sparkle');
    setTimeout(() => el.input.focus({ preventScroll: true }), 400);
  }

  async function hide() {
    await gsap.to(el.panel, { opacity: 0, duration: 0.6, ease: 'power2.in' }).then();
    el.panel.hidden = true;
    open = false;
    ui.setDockAway(false);
    app.setMode('explore');
  }

  /** Dissolve the input text into particles that gather at the star. */
  function textToParticles(text) {
    const inRect = el.input.getBoundingClientRect();
    const starRect = el.star.getBoundingClientRect();
    const cs = getComputedStyle(el.input);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:36';
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // render the text where the input shows it, then sample its pixels
    const off = document.createElement('canvas');
    off.width = Math.ceil(inRect.width);
    off.height = Math.ceil(inRect.height);
    const octx = off.getContext('2d');
    octx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    octx.textBaseline = 'middle';
    octx.fillStyle = '#fff';
    const padL = parseFloat(cs.paddingLeft) || 0;
    const tw = octx.measureText(text).width;
    const align = cs.textAlign === 'center' ? (inRect.width - tw) / 2 : padL;
    octx.fillText(text, align, inRect.height / 2);
    const data = octx.getImageData(0, 0, off.width, off.height).data;
    const pts = [];
    const step = 2;
    for (let y = 0; y < off.height; y += step) {
      for (let x = 0; x < off.width; x += step) {
        if (data[(y * off.width + x) * 4 + 3] > 120) pts.push([inRect.left + x, inRect.top + y]);
      }
    }
    const cap = 1400;
    const sample = pts.length > cap ? pts.filter((_, i) => i % Math.ceil(pts.length / cap) === 0) : pts;
    const cx = starRect.left + starRect.width / 2;
    const cy = starRect.top + starRect.height / 2;
    const parts = sample.map(([x, y]) => ({
      x,
      y,
      sx: x,
      sy: y,
      delay: Math.random() * 0.5 + ((x - inRect.left) / inRect.width) * 0.4,
      r: 0.8 + Math.random() * 1.4,
      wob: Math.random() * 6.28,
    }));

    return new Promise((resolve) => {
      const start = performance.now();
      const orb = { x: cx, y: cy, size: 0, rise: 0 };
      let raf = 0;
      const frame = (now) => {
        const t = (now - start) / 1000;
        ctx.clearRect(0, 0, innerWidth, innerHeight);
        ctx.globalCompositeOperation = 'lighter';
        // particles travel to the star along gentle curves
        for (const p of parts) {
          const k = Math.min(Math.max((t - p.delay) / 1.3, 0), 1);
          const e = k * k * (3 - 2 * k);
          const bend = Math.sin(e * Math.PI) * 60;
          p.x = p.sx + (cx - p.sx) * e + Math.cos(p.wob + t * 3) * bend * 0.4;
          p.y = p.sy + (cy - p.sy) * e - bend;
          const a = (1 - e * 0.85) * (k > 0 ? 1 : 0.9);
          ctx.fillStyle = `rgba(255,${200 + ((p.wob * 10) | 0) % 50},140,${a})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * (1 - e * 0.6), 0, Math.PI * 2);
          ctx.fill();
        }
        // the gathered orb, then its rise
        if (t > 0.9) {
          orb.size = Math.min(1, (t - 0.9) / 0.9);
          if (t > 2.0) orb.rise = Math.min(1, (t - 2.0) / 1.1);
          const y = cy - orb.rise * orb.rise * (cy + 80);
          const r = 10 + orb.size * 26;
          const g = ctx.createRadialGradient(cx, y, 0, cx, y, r * 2.2);
          g.addColorStop(0, `rgba(255,250,235,${orb.size})`);
          g.addColorStop(0.25, `rgba(255,220,150,${0.8 * orb.size})`);
          g.addColorStop(1, 'rgba(255,180,90,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(cx, y, r * 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
        if (t < 3.2) raf = requestAnimationFrame(frame);
        else {
          cancelAnimationFrame(raf);
          canvas.remove();
          resolve();
        }
      };
      raf = requestAnimationFrame(frame);
    });
  }

  async function send(text) {
    if (sending) return;
    sending = true;
    el.submit.disabled = true;
    el.panel.classList.add('is-sending');
    audio.play('wish');
    gsap.to([el.form, el.cancel, '.wish__title', '.wish__sub'], { opacity: 0, duration: 0.8, delay: 0.5 });
    gsap.to(el.star, { scale: 1.25, duration: 1, delay: 0.8, yoyo: true, repeat: 1, ease: 'sine.inOut' });
    await textToParticles(text);
    gsap.to(el.panel, { opacity: 0, duration: 0.6 });

    // in 3D: a light rises from the star on the tree into the sky and stays
    const dir = new THREE.Vector3((Math.random() - 0.5) * 1.1, 0.55 + Math.random() * 0.35, -0.6 - Math.random() * 0.4);
    dir.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(camera.position.x, camera.position.z)));
    dir.normalize();
    const from = app.tree.star.group.getWorldPosition(new THREE.Vector3());
    const to = dir.clone().multiplyScalar(300);
    const light = glowSprite(0xfff0cf, 2.5, 1);
    light.position.copy(from);
    scene.add(light);
    el.panel.hidden = true;
    open = false;

    const back = rig.saveView();
    const up = camera.position.clone();
    rig.setLimits('locked');
    rig.flyTo({ position: up, target: from.clone().lerp(to, 0.08), duration: 2.4, arc: false });
    const path = { k: 0 };
    let emitAcc = 0;
    const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 40, 0));
    const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
    await gsap
      .to(path, {
        k: 1,
        duration: 3.4,
        ease: 'power2.in',
        onUpdate: () => {
          curve.getPoint(path.k, light.position);
          light.scale.setScalar(2.5 + path.k * 14);
          emitAcc += 1;
          if (emitAcc % 2 === 0 && path.k < 0.25) bursts.emit(light.position, { count: 4, speed: 0.3, life: 1.4, size: 0.12, gravity: -0.1, colors: [0xffe2a0, 0xfff4d8] });
        },
      })
      .then();
    scene.remove(light);
    light.material.dispose();
    addSkyStar(dir, { animate: true });
    saveWish(text, dir);
    audio.play('bell');
    ui.toast('Your wish now shines in the Christmas sky', 4800);
    await new Promise((r) => setTimeout(r, 900));
    rig.setLimits('tree');
    await rig.flyTo({ ...back, duration: 2 });
    sending = false;
    el.panel.classList.remove('is-sending');
    gsap.set([el.form, el.cancel, '.wish__title', '.wish__sub', el.star, el.panel], { clearProps: 'opacity,scale' });
    ui.setDockAway(false);
    app.setMode('explore');
  }

  const ac = new AbortController();
  el.form.addEventListener(
    'submit',
    (e) => {
      e.preventDefault();
      const text = el.input.value.trim();
      if (!text) {
        el.input.focus();
        gsap.fromTo(el.form, { x: -6 }, { x: 0, duration: 0.5, ease: 'elastic.out(1, 0.3)' });
        return;
      }
      send(text);
    },
    { signal: ac.signal }
  );
  el.cancel.addEventListener('click', () => !sending && hide(), { signal: ac.signal });
  window.addEventListener('keydown', (e) => e.key === 'Escape' && open && !sending && hide(), { signal: ac.signal });

  function update(t) {
    for (const s of stars) {
      if (!s.userData.animating) s.material.opacity = 0.65 + 0.3 * Math.sin(t * 1.6 + s.userData.phase);
    }
  }

  return {
    show,
    update,
    get open() {
      return open;
    },
    dispose() {
      ac.abort();
    },
  };
}
