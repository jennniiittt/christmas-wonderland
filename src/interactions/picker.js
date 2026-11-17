import * as THREE from 'three';

/**
 * Pointer picking for 3D objects. Distinguishes taps from orbit-drags, so a
 * drag to look around never accidentally opens something. Works the same
 * for mouse, pen and touch (touch simply has no hover state).
 *
 * register({ object, onClick, onHover?, tooltip?, enabled? })
 */
export function createPicker({ dom, camera, ui, signal, activeScene = () => null }) {
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const targets = [];
  const occluders = [];
  let hovered = null;
  let down = null;
  let active = true;
  let lastMove = null;

  function register(t) {
    t.object.userData.pickTarget = t;
    targets.push(t);
    return () => {
      const i = targets.indexOf(t);
      if (i >= 0) targets.splice(i, 1);
    };
  }

  function pick(clientX, clientY) {
    const rect = dom.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const objs = [];
    const scene = activeScene();
    for (const t of targets) {
      if (!t.object.visible || (t.enabled && !t.enabled())) continue;
      if (scene) {
        let root = t.object;
        while (root.parent) root = root.parent;
        if (root !== scene) continue;
      }
      objs.push(t.object);
    }
    if (!objs.length) return null;
    for (const o of occluders) {
      let root = o;
      while (root.parent) root = root.parent;
      if (!scene || root === scene) objs.push(o);
    }
    const hits = ray.intersectObjects(objs, false);
    if (!hits.length) return null;
    return hits[0].object.userData.pickTarget ?? null; // occluders have no target
  }

  function setHover(t, e) {
    if (hovered === t) {
      if (t && t.tooltip && e) ui.showTooltip(typeof t.tooltip === 'function' ? t.tooltip() : t.tooltip, e.clientX, e.clientY);
      return;
    }
    if (hovered) hovered.onHover?.(false);
    hovered = t;
    if (t) {
      t.onHover?.(true);
      dom.style.cursor = 'pointer';
      if (t.tooltip && e) ui.showTooltip(typeof t.tooltip === 'function' ? t.tooltip() : t.tooltip, e.clientX, e.clientY);
    } else {
      dom.style.cursor = '';
      ui.hideTooltip();
    }
  }

  dom.addEventListener(
    'pointerdown',
    (e) => {
      down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, type: e.pointerType };
    },
    { signal }
  );

  dom.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      lastMove = e;
    },
    { signal }
  );

  dom.addEventListener(
    'pointerleave',
    () => {
      lastMove = null;
      setHover(null);
    },
    { signal }
  );

  dom.addEventListener(
    'pointerup',
    (e) => {
      if (!down || down.id !== e.pointerId) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const dt = performance.now() - down.t;
      down = null;
      if (!active || moved > 8 || dt > 650) return;
      const t = pick(e.clientX, e.clientY);
      if (!t) return;
      if (e.pointerType !== 'mouse') {
        // brief hover flash on touch so the response is still visible
        t.onHover?.(true);
        setTimeout(() => t.onHover?.(false), 400);
      }
      t.onClick?.(e);
    },
    { signal }
  );

  /** Hover is resolved once per frame (cheap, and never more than needed). */
  function update() {
    if (!active) {
      if (hovered) setHover(null);
      return;
    }
    if (!lastMove) return;
    const e = lastMove;
    lastMove = null;
    setHover(pick(e.clientX, e.clientY), e);
  }

  return {
    register,
    addOccluder(o) {
      occluders.push(o);
    },
    update,
    pick,
    setActive(v) {
      active = v;
      if (!v) setHover(null);
    },
    get active() {
      return active;
    },
  };
}
