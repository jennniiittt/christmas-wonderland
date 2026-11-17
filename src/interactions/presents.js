import * as THREE from 'three';
import gsap from 'gsap';
import { GIFTS, REGULAR_GIFT_COUNT } from '../config/gifts.js';
import { createGiftBox } from '../scenes/giftBox.js';
import { groundHeightNear } from '../scenes/environment.js';
import { glowSprite } from '../utils/helpers.js';
import { world } from '../core/world.js';
import { REVEALS } from './giftReveals.js';
import { CameraRig } from '../core/cameraRig.js';

const STORAGE_KEY = 'cw-gifts-v1';

/**
 * The Mystery Presents beneath the tree. Each present owns its state:
 *   'wrapped' → 'opening' → 'open'   (special: 'locked' → 'wrapped' → …)
 * A single `busy` flag guards against overlapping/accidental re-opens.
 */
export function createPresents(app) {
  const { scene, rig, ui, audio, bursts, picker } = app;
  const group = new THREE.Group();
  group.name = 'presents';
  scene.add(group);

  let busy = false;
  const presents = GIFTS.map((cfg, index) => {
    const box = createGiftBox({ size: cfg.size, style: cfg.style, special: !!cfg.special });
    const a = THREE.MathUtils.degToRad(cfg.angle);
    const pos = new THREE.Vector3(Math.cos(a) * cfg.radius, 0, Math.sin(a) * cfg.radius);
    pos.y = groundHeightNear(cfg.radius) - 0.02;
    box.root.position.copy(pos);
    // face roughly toward the visitor with a natural, slightly random twist
    box.root.rotation.y = -a + Math.PI / 2 + (index % 2 ? 0.28 : -0.22);
    group.add(box.root);
    return {
      cfg,
      index,
      box,
      pos,
      state: cfg.special ? 'locked' : 'wrapped',
      hover: 0,
      phase: index * 1.7,
      lidFloat: 0,
    };
  });
  const special = presents.find((p) => p.cfg.special);
  const regular = presents.filter((p) => !p.cfg.special);

  /* ---------- progress orbs circling the special present ---------- */
  const orbs = regular.map((p, i) => {
    const mat = new THREE.MeshBasicMaterial({ color: 0x3a3226 });
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), mat);
    const glow = glowSprite(p.box.glowColor, 0.8, 0);
    m.add(glow);
    special.box.root.add(m);
    return { mesh: m, mat, glow, lit: 0, angle: (i / regular.length) * Math.PI * 2, radius: Math.max(...special.cfg.size) * 0.95, y: special.cfg.size[1] * 0.55, owner: p };
  });

  /* ---------- persistence: remember opened gifts for this visit (survives a reload) ---------- */
  function save() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(presents.filter((p) => p.state === 'open').map((p) => p.cfg.id)));
    } catch {
      /* ignore */
    }
  }
  function restore() {
    let ids = [];
    try {
      ids = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      ids = [];
    }
    for (const p of presents) {
      if (!ids.includes(p.cfg.id)) continue;
      if (p.cfg.special && regular.some((r) => !ids.includes(r.cfg.id))) continue;
      setOpenedInstantly(p);
    }
    const n = openedCount();
    orbs.forEach((o) => (o.lit = o.owner.state === 'open' ? 1 : 0));
    if (n >= REGULAR_GIFT_COUNT && special.state === 'locked') setUnlockedInstantly();
    ui.setGiftCount(n, REGULAR_GIFT_COUNT);
    if (special.state === 'open') app.onAllMagicFound?.(true);
  }

  const openedCount = () => regular.filter((p) => p.state === 'open').length;

  function setOpenedInstantly(p) {
    const b = p.box;
    p.state = 'open';
    b.bow.visible = false;
    b.lidRibbons.visible = false;
    b.bodyRibbons.visible = false;
    b.lidPivot.position.y = b.dims.hb + b.dims.h * 0.55;
    b.lidPivot.rotation.set(-0.5, 0, 0.18);
    b.cavity.material.opacity = 0.9;
    b.coreGlow.material.opacity = 0.55;
    p.lidFloat = 1;
  }
  function setUnlockedInstantly() {
    special.state = 'wrapped';
    if (special.box.lock) special.box.lock.group.visible = false;
    orbs.forEach((o) => (o.mesh.visible = false));
  }

  /* ---------- picking ---------- */
  for (const p of presents) {
    picker.register({
      object: p.box.hit,
      enabled: () => !busy,
      tooltip: () => {
        if (p.state === 'locked') return `Locked — ${openedCount()} / ${REGULAR_GIFT_COUNT} magical gifts discovered`;
        if (p.state === 'open') return `${p.cfg.name} — open it again`;
        return p.cfg.special ? 'The grandest surprise awaits…' : 'Something magical awaits...';
      },
      onHover: (on) => setHover(p, on),
      onClick: () => open(p),
    });
  }

  function setHover(p, on) {
    gsap.to(p, { hover: on ? 1 : 0, duration: on ? 0.45 : 0.6, ease: on ? 'back.out(2)' : 'power2.out' });
    if (on && p.state !== 'open') {
      audio.play('hover');
      // the bow gives a little wiggle
      const bow = p.box.bow;
      gsap.fromTo(bow.rotation, { z: 0 }, { z: 0.12, duration: 0.12, yoyo: true, repeat: 3, ease: 'sine.inOut', onComplete: () => (bow.rotation.z = 0) });
      for (const loop of bow.userData.loops) {
        gsap.fromTo(loop.scale, { x: 1, y: 1 }, { x: 1.12, y: 0.92, duration: 0.25, yoyo: true, repeat: 1, ease: 'sine.inOut' });
      }
    }
  }

  /* ---------- camera framing ---------- */
  function focusView(p, { distance = 3.2, height = 1.5, side = 0.6 } = {}) {
    const out = new THREE.Vector3(p.pos.x, 0, p.pos.z).normalize();
    const sideV = new THREE.Vector3(-out.z, 0, out.x);
    const target = p.pos.clone().add(new THREE.Vector3(0, p.cfg.size[1] * 0.85, 0));
    const position = target
      .clone()
      .add(out.multiplyScalar(distance * CameraRig.portraitFactor()))
      .add(sideV.multiplyScalar(side))
      .add(new THREE.Vector3(0, height, 0));
    return { position, target };
  }

  /* ---------- opening ---------- */
  async function open(p) {
    if (busy || app.mode !== 'explore') return;
    if (p.state === 'locked') {
      lockedNudge(p);
      return;
    }
    busy = true;
    app.setMode('focus');
    ui.hideTooltip();
    ui.clearHint();
    const returnView = rig.saveView();

    audio.play('whoosh');
    gsap.to(world, { timeScale: 0.22, duration: 1.4, ease: 'power2.out' });
    for (const o of presents) if (o !== p) gsap.to(o.box.halo.material, { opacity: 0.06, duration: 1 });

    const reveal = REVEALS[p.cfg.reveal];
    const maxDim = Math.max(...p.cfg.size);
    const view = focusView(p, { distance: 2.4 + maxDim * 1.6, height: 0.9 + maxDim * 0.6, side: 0.5, ...(reveal.view || {}) });
    rig.setLimits('focus');
    const shiftX = window.innerWidth > 860 ? -0.17 : 0;
    const shiftY = window.innerWidth > 860 ? 0 : 0.16;
    rig.setShift(shiftX, shiftY, 1.6);
    await rig.flyTo({ ...view, duration: 1.7 });

    const firstTime = p.state !== 'open';
    if (firstTime) {
      p.state = 'opening';
      await unwrap(p);
      p.state = 'open';
    } else {
      await reglow(p);
    }

    // the surprise itself
    await reveal.play(app, p, { firstTime });

    // back to the tree
    rig.setShift(0, 0, 1.4);
    for (const o of presents) gsap.to(o.box.halo.material, { opacity: 0.18, duration: 1.2 });
    gsap.to(p.box.beam.uniforms.uOpacity, { value: 0, duration: 1.2, onComplete: () => (p.box.beam.mesh.visible = false) });
    gsap.to(world, { timeScale: 1, duration: 1.6, ease: 'power2.inOut' });
    rig.setLimits('tree');
    await rig.flyTo({ ...returnView, duration: 1.6 });

    busy = false;
    app.setMode('explore');

    if (firstTime) {
      save();
      if (!p.cfg.special) {
        const n = openedCount();
        ui.setGiftCount(n, REGULAR_GIFT_COUNT);
        const orb = orbs.find((o) => o.owner === p);
        if (orb) gsap.to(orb, { lit: 1, duration: 1.2, ease: 'power2.out' });
        if (n >= REGULAR_GIFT_COUNT && special.state === 'locked') {
          await unlockSpecial();
        } else {
          ui.toast(`${n} / ${REGULAR_GIFT_COUNT} magical gifts discovered`);
        }
      } else {
        app.onAllMagicFound?.(false);
      }
    }
  }

  /** The full unwrapping: ribbon comes loose, lid opens, light pours out. */
  function unwrap(p) {
    const b = p.box;
    const { h, hb } = b.dims;
    const top = new THREE.Vector3();
    return new Promise((resolve) => {
      const tl = gsap.timeline({ onComplete: resolve });
      tl.add(() => audio.play('untie'), 0);
      // bow loosens: loops unfurl, then the bow lifts and twirls away
      b.bow.userData.loops.forEach((loop, i) => {
        tl.to(loop.rotation, { z: i ? -0.9 : 0.9, duration: 0.7, ease: 'power2.inOut' }, 0);
        tl.to(loop.scale, { x: 1.35, y: 0.55, duration: 0.7, ease: 'power2.inOut' }, 0);
      });
      tl.to(b.bow.userData.knot.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.6, ease: 'power2.in' }, 0.25);
      tl.to(b.bow.position, { y: '+=0.9', duration: 1.1, ease: 'power2.in' }, 0.35);
      tl.to(b.bow.rotation, { y: '+=3.5', duration: 1.1, ease: 'power2.in' }, 0.35);
      // ribbons slip off the box
      tl.to(b.lidRibbons.scale, { x: 1.3, z: 1.3, duration: 0.8, ease: 'power2.in' }, 0.45);
      tl.to(b.lidRibbons.position, { y: '+=0.25', duration: 0.8, ease: 'power2.in' }, 0.45);
      tl.to(b.bodyRibbons.scale, { y: 0.001, duration: 0.9, ease: 'power3.in' }, 0.5);
      tl.to(b.ribbonMat, { opacity: 0, duration: 0.7, ease: 'power1.in' }, 0.75);
      tl.add(() => {
        b.bow.visible = false;
        b.lidRibbons.visible = false;
        b.bodyRibbons.visible = false;
      }, 1.5);
      // seam glows brighter just before the lid opens
      tl.to(b.seamMat, { opacity: 1, duration: 0.5, ease: 'power2.in' }, 1.0);
      tl.to(b.paperMat, { emissiveIntensity: 0.25, duration: 0.5, yoyo: true, repeat: 1 }, 1.0);
      // lid opens and floats up
      tl.add(() => audio.play('open'), 1.45);
      tl.to(b.lidPivot.position, { y: hb + h * 0.55, duration: 1.3, ease: 'back.out(1.6)' }, 1.45);
      tl.to(b.lidPivot.rotation, { x: -0.5, z: 0.18, duration: 1.3, ease: 'back.out(1.4)' }, 1.45);
      tl.to(b.seamMat, { opacity: 0.35, duration: 0.8 }, 1.8);
      // light and particles pour out
      tl.add(() => {
        b.beam.mesh.visible = true;
        b.beam.mesh.scale.set(0.3, 0.01, 0.3);
        b.body.getWorldPosition(top);
        top.y += hb / 2;
        bursts.emit(top, {
          count: 140,
          shape: 'fountain',
          spread: 0.45,
          speed: 4.2,
          gravity: -1.2,
          drag: 1.1,
          life: 2.4,
          size: 0.12,
          colors: [0xffe2a0, 0xfff4d8, b.glowColor.getHex(), 0xffc060],
          radius: 0.15,
        });
      }, 1.55);
      tl.to(b.beam.mesh.scale, { x: 1, y: 1, z: 1, duration: 1.2, ease: 'power3.out' }, 1.55);
      tl.to(b.beam.uniforms.uOpacity, { value: 1, duration: 0.8, ease: 'power2.out' }, 1.55);
      tl.to(b.cavity.material, { opacity: 0.9, duration: 0.6 }, 1.55);
      tl.to(b.coreGlow.material, { opacity: 0.9, duration: 0.6 }, 1.55);
      tl.to(b.coreGlow.material, { opacity: 0.55, duration: 1.5 }, 2.4);
      tl.to(p, { lidFloat: 1, duration: 1 }, 2.7);
      tl.to({}, { duration: 0.2 }, 2.8);
    });
  }

  /** Revisit: the open box glows again and replays its surprise. */
  function reglow(p) {
    const b = p.box;
    const top = new THREE.Vector3();
    b.body.getWorldPosition(top);
    top.y += b.dims.hb / 2;
    audio.play('magic');
    b.beam.mesh.visible = true;
    bursts.emit(top, { count: 70, shape: 'fountain', spread: 0.4, speed: 3.4, gravity: -1, life: 2, size: 0.1, colors: [0xffe2a0, b.glowColor.getHex()] });
    return gsap
      .timeline()
      .fromTo(b.beam.mesh.scale, { y: 0.01 }, { y: 1, duration: 1, ease: 'power3.out' }, 0)
      .to(b.beam.uniforms.uOpacity, { value: 1, duration: 0.6 }, 0)
      .to(b.coreGlow.material, { opacity: 1, duration: 0.4, yoyo: true, repeat: 1 }, 0)
      .then();
  }

  function lockedNudge(p) {
    const lock = p.box.lock;
    audio.play('locked');
    if (lock) {
      gsap.fromTo(lock.group.rotation, { z: 0 }, { z: 0.22, duration: 0.07, yoyo: true, repeat: 5, ease: 'sine.inOut', onComplete: () => (lock.group.rotation.z = 0) });
      gsap.fromTo(lock.glow.material, { opacity: 1 }, { opacity: 0.5, duration: 0.8 });
    }
    const n = openedCount();
    ui.toast(`${n} / ${REGULAR_GIFT_COUNT} magical gifts discovered — open them all to unlock this one`);
  }

  /** All five found: the orbs spiral in, the lock dissolves, the gift awakens. */
  async function unlockSpecial() {
    busy = true;
    app.setMode('focus');
    const back = rig.saveView();
    const view = focusView(special, { distance: 5.6, height: 2.0, side: 0 });
    rig.setLimits('focus');
    await rig.flyTo({ ...view, duration: 1.8 });
    const b = special.box;
    const lock = b.lock;
    const center = new THREE.Vector3();
    b.root.getWorldPosition(center);
    center.y += special.cfg.size[1] * 0.6;

    await new Promise((resolve) => {
      const tl = gsap.timeline({ onComplete: resolve });
      orbs.forEach((o, i) => {
        tl.to(o, { radius: 0.05, y: special.cfg.size[1] * 0.7, duration: 1.6, ease: 'power3.in' }, i * 0.08);
        tl.to(o, { angle: `+=${Math.PI * 3}`, duration: 1.6, ease: 'power2.in' }, i * 0.08);
      });
      tl.add(() => {
        orbs.forEach((o) => (o.mesh.visible = false));
        audio.play('unlock');
        bursts.emit(center, { count: 160, speed: 3.2, life: 1.8, size: 0.11, gravity: -0.3, colors: [0xffe2a0, 0xfff6e0, 0xffc45c] });
      }, 1.9);
      if (lock) {
        tl.to(lock.shacklePivot.rotation, { y: -1.2, duration: 0.5, ease: 'back.out(2)' }, 2.0);
        tl.to(lock.shacklePivot.position, { y: '+=0.08', duration: 0.5, ease: 'back.out(2)' }, 2.0);
        tl.to(lock.group.position, { y: '+=0.5', duration: 1.1, ease: 'power2.in' }, 2.5);
        tl.to(lock.group.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.8, ease: 'power3.in' }, 2.8);
        tl.add(() => {
          const lp = new THREE.Vector3();
          lock.group.getWorldPosition(lp);
          bursts.emit(lp, { count: 90, speed: 2, life: 1.6, size: 0.09, colors: [0xffe2a0, 0xffd27a] });
          lock.group.visible = false;
        }, 3.5);
      }
      tl.to(b.halo.scale, { x: 6.5, y: 6.5, duration: 1.6, ease: 'power2.out' }, 2.4);
      tl.to(b.halo.material, { opacity: 0.55, duration: 1.6 }, 2.4);
      tl.to(b.seamMat, { opacity: 1, duration: 1 }, 2.4);
      tl.to(b.paperMat, { emissiveIntensity: 0.22, duration: 1.4 }, 2.4);
      tl.to({}, { duration: 0.6 }, 3.8);
    });

    special.state = 'wrapped';
    special.awakened = true;
    ui.toast('The Special Golden Present has awakened — open it!', 5200);
    rig.setLimits('tree');
    await rig.flyTo({ ...back, duration: 1.6 });
    busy = false;
    app.setMode('explore');
  }

  /* ---------- the "Open a Present" menu action ---------- */
  async function tour() {
    if (busy || app.mode !== 'explore') return;
    const next = special.state === 'wrapped' && openedCount() >= REGULAR_GIFT_COUNT ? special : regular.find((p) => p.state !== 'open') ?? special;
    const center = new THREE.Vector3(next.pos.x * 0.55, 1.4, next.pos.z * 0.55);
    const out = new THREE.Vector3(next.pos.x, 0, next.pos.z).normalize();
    const position = center.clone().add(out.multiplyScalar(9)).add(new THREE.Vector3(0, 3.2, 0));
    await rig.flyTo({ position, target: center, duration: 1.8 });
    ui.hint(
      world.coarsePointer ? 'Tap a present to open it' : 'Click a present to open it',
      4500
    );
    gsap.fromTo(next, { hover: 0 }, { hover: 1, duration: 0.5, yoyo: true, repeat: 3, ease: 'sine.inOut' });
  }

  /* ---------- per-frame ---------- */
  function update(dt, t) {
    for (const p of presents) {
      const b = p.box;
      const breath = Math.sin(t * 0.9 + p.phase);
      const k = p.hover;
      b.inner.position.y = 0.025 + breath * 0.02 + k * 0.08;
      const s = 1 + breath * 0.008 + k * 0.07;
      b.inner.scale.setScalar(s);
      b.shadow.material.opacity = 0.6 - k * 0.15;
      if (p.state !== 'opening') {
        b.seamMat.opacity = (p.state === 'open' ? 0.35 : 0.22 + 0.12 * (0.5 + 0.5 * Math.sin(t * 2 + p.phase))) + k * 0.6;
      }
      const base = p === special && special.awakened ? 0.55 : p.state === 'locked' ? 0.12 : 0.18;
      if (!busy) b.halo.material.opacity = base + k * 0.35 + (p.state === 'open' ? 0.06 : 0);
      if (p.lidFloat > 0) {
        b.lidPivot.position.y = b.dims.hb + b.dims.h * 0.55 + Math.sin(t * 1.2 + p.phase) * 0.05 * p.lidFloat;
        b.lidPivot.rotation.y = Math.sin(t * 0.5 + p.phase) * 0.15 * p.lidFloat;
      }
    }
    // special: progress orbs + lock float
    for (const o of orbs) {
      if (!o.mesh.visible) continue;
      o.angle += dt * 0.55;
      o.mesh.position.set(Math.cos(o.angle) * o.radius, o.y + Math.sin(t * 2 + o.angle) * 0.06, Math.sin(o.angle) * o.radius);
      o.mat.color.setRGB(0.23, 0.2, 0.15).lerp(o.owner.box.glowColor, o.lit);
      o.glow.material.opacity = o.lit * (0.7 + 0.3 * Math.sin(t * 3 + o.angle));
    }
    const lock = special.box.lock;
    if (lock && lock.group.visible && special.state === 'locked') {
      lock.group.position.y = special.cfg.size[1] + 0.75 + Math.sin(t * 1.4) * 0.06;
      lock.group.rotation.y = Math.sin(t * 0.7) * 0.5;
      lock.glow.material.opacity = 0.35 + 0.15 * Math.sin(t * 2.2);
    }
    if (special.awakened || (special.state !== 'locked' && special.state !== 'open')) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
      special.box.paperMat.emissiveIntensity = 0.12 + pulse * 0.12 + special.hover * 0.2;
    }
  }

  return {
    group,
    presents,
    update,
    tour,
    restore,
    get busy() {
      return busy;
    },
    openedCount,
  };
}
