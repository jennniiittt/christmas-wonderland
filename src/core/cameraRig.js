import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import gsap from 'gsap';
import { world } from './world.js';

const _s0 = new THREE.Spherical();
const _s1 = new THREE.Spherical();
const _v = new THREE.Vector3();

/**
 * Orbit controls plus cinematic "fly" moves. Flights interpolate in spherical
 * coordinates around a moving target, so the camera arcs gracefully around
 * the tree instead of cutting straight through its branches.
 */
export class CameraRig {
  constructor(camera, dom) {
    this.camera = camera;
    this.controls = new OrbitControls(camera, dom);
    const c = this.controls;
    c.enableDamping = true;
    c.dampingFactor = 0.06;
    c.rotateSpeed = 0.55;
    c.zoomSpeed = 0.7;
    c.enablePan = false;
    c.autoRotateSpeed = 0.28;
    c.enabled = false;

    this.flying = null;
    this.allowControl = false; // whether orbiting is allowed once a flight ends
    this.idle = 0;
    this.autoRotateAllowed = false;
    this.shift = { x: 0, y: 0 }; // view offset as a fraction of the viewport
    this._lastShift = { x: NaN, y: NaN, w: 0, h: 0 };

    this._onStart = () => {
      this.idle = 0;
      c.autoRotate = false;
    };
    c.addEventListener('start', this._onStart);
  }

  setLimits(preset) {
    const c = this.controls;
    const p = {
      tree: { min: 9, max: 42, minPolar: 0.35, maxPolar: 1.62, target: null },
      focus: { min: 1.2, max: 14, minPolar: 0.2, maxPolar: 1.66 },
      globe: { min: 2.2, max: 6.5, minPolar: 0.35, maxPolar: 1.75 },
      village: { min: 0.12, max: 0.7, minPolar: 0.6, maxPolar: 1.54 },
      locked: { min: 0.01, max: 500, minPolar: 0, maxPolar: Math.PI },
    }[preset];
    c.minDistance = p.min;
    c.maxDistance = p.max;
    c.minPolarAngle = p.minPolar;
    c.maxPolarAngle = p.maxPolar;
  }

  /** Fly camera so it ends at `position` looking at `target`. */
  flyTo({ position, target, duration = 1.8, ease = 'power3.inOut', arc = true }) {
    const cam = this.camera;
    const c = this.controls;
    if (this.flying) this.flying.kill();
    c.enabled = false;
    c.autoRotate = false;

    const t0 = c.target.clone();
    const t1 = target.clone();
    _s0.setFromVector3(_v.copy(cam.position).sub(t0));
    _s1.setFromVector3(_v.copy(position).sub(t1));
    const from = { r: _s0.radius, phi: _s0.phi, theta: _s0.theta };
    let dTheta = _s1.theta - _s0.theta;
    if (dTheta > Math.PI) dTheta -= Math.PI * 2;
    if (dTheta < -Math.PI) dTheta += Math.PI * 2;
    const to = { r: _s1.radius, phi: _s1.phi, theta: _s0.theta + dTheta };
    const p0 = cam.position.clone();

    const state = { k: 0 };
    return new Promise((resolve) => {
      this.flying = gsap.to(state, {
        k: 1,
        duration: world.reducedMotion ? Math.min(duration, 0.6) : duration,
        ease,
        onUpdate: () => {
          const k = state.k;
          c.target.lerpVectors(t0, t1, k);
          if (arc) {
            const s = new THREE.Spherical(
              THREE.MathUtils.lerp(from.r, to.r, k),
              THREE.MathUtils.lerp(from.phi, to.phi, k),
              THREE.MathUtils.lerp(from.theta, to.theta, k)
            );
            cam.position.setFromSpherical(s).add(c.target);
          } else {
            cam.position.lerpVectors(p0, position, k);
          }
          cam.lookAt(c.target);
        },
        onComplete: () => {
          this.flying = null;
          cam.position.copy(position);
          c.target.copy(t1);
          c.update();
          c.enabled = this.allowControl;
          this.idle = 0;
          resolve();
        },
      });
    });
  }

  setControl(allowed) {
    this.allowControl = allowed;
    if (!this.flying) this.controls.enabled = allowed;
    if (!allowed) this.controls.autoRotate = false;
  }

  /** Extra distance needed on narrow (portrait) screens to keep a subject in frame. */
  static portraitFactor() {
    const aspect = window.innerWidth / window.innerHeight;
    return Math.pow(Math.max(1, 1.05 / aspect), 0.75);
  }

  saveView() {
    return { position: this.camera.position.clone(), target: this.controls.target.clone() };
  }

  /** Tween the projection centre (used so reveal cards don't cover the subject). */
  setShift(x, y, duration = 1.2) {
    gsap.to(this.shift, { x, y, duration, ease: 'power3.inOut' });
  }

  _applyShift() {
    const cam = this.camera;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const s = this.shift;
    const l = this._lastShift;
    if (l.x === s.x && l.y === s.y && l.w === w && l.h === h) return;
    l.x = s.x;
    l.y = s.y;
    l.w = w;
    l.h = h;
    if (Math.abs(s.x) < 1e-4 && Math.abs(s.y) < 1e-4) {
      cam.clearViewOffset();
    } else {
      // positive x moves the subject left (to make room for a card on the right)
      cam.setViewOffset(w, h, -s.x * w, -s.y * h, w, h);
    }
  }

  update(dt) {
    this._applyShift();
    if (this.flying) return;
    const c = this.controls;
    if (c.enabled) {
      this.idle += dt;
      if (this.autoRotateAllowed && !world.reducedMotion && this.idle > 9) c.autoRotate = true;
      c.update(dt);
    }
  }

  dispose() {
    this.flying?.kill();
    this.controls.removeEventListener('start', this._onStart);
    this.controls.dispose();
  }
}
