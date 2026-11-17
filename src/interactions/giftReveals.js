import * as THREE from 'three';
import gsap from 'gsap';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { escapeHTML, splitText, glowSprite, wait } from '../utils/helpers.js';

/* --------------------------------------------------------------------------
   Card helpers
   -------------------------------------------------------------------------- */
const esc = escapeHTML;
const FLOURISH = `<svg class="greeting__flourish" viewBox="0 0 300 46" aria-hidden="true">
  <path d="M8 26 C 50 26, 70 10, 104 18 S 136 38, 150 23 S 166 6, 196 18 S 250 26, 292 26"/>
  <path d="M138 23 c 4 -9, 20 -9, 24 0 c -4 9, -20 9, -24 0z"/>
</svg>`;

function textBlocks(text) {
  return String(text)
    .split(/\n\n+/)
    .map((para) => `<p class="card__text">${esc(para).replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

function basicCard(cfg, extra = '') {
  return `
    <p class="card__kicker">${esc(cfg.kicker)}</p>
    <h3 class="card__title" id="cardTitle">${esc(cfg.title)}</h3>
    ${textBlocks(cfg.text)}
    ${cfg.signature ? `<p class="card__sig">${esc(cfg.signature)}</p>` : ''}
    ${extra}`;
}

function animateCardIn(body) {
  const items = body.querySelectorAll('.card__kicker, .card__title, .card__text, .card__sig, .card__actions');
  gsap.from(items, { opacity: 0, y: 14, duration: 0.9, ease: 'power3.out', stagger: 0.09, delay: 0.15 });
}

function topOf(p) {
  const v = new THREE.Vector3();
  p.box.body.getWorldPosition(v);
  v.y += p.box.dims.hb / 2;
  return v;
}

/* --------------------------------------------------------------------------
   1. GOLDEN — animated Christmas greeting
   -------------------------------------------------------------------------- */
const greeting = {
  async play(app, p) {
    const { ui, bursts } = app;
    const top = topOf(p);
    // spiralling golden rings around the present
    let k = 0;
    const ringTimer = setInterval(() => {
      if (k++ > 5) return clearInterval(ringTimer);
      bursts.emit(top.clone().add(new THREE.Vector3(0, k * 0.25, 0)), {
        count: 40,
        shape: 'ring',
        speed: 1.4 + k * 0.1,
        gravity: 0.4,
        drag: 1.4,
        life: 1.8,
        size: 0.08,
        colors: [0xffe2a0, 0xfff4d8, 0xffc45c],
      });
    }, 260);
    const cfg = p.cfg;
    const html = `
      <div class="greeting">
        <p class="card__kicker">${esc(cfg.kicker)}</p>
        ${FLOURISH}
        <h3 class="greeting__title" id="cardTitle">${esc(cfg.title)}</h3>
        ${FLOURISH.replace('class="greeting__flourish"', 'class="greeting__flourish" style="transform:scaleY(-1)"')}
        ${textBlocks(cfg.text)}
        <p class="card__sig">${esc(cfg.signature || '')}</p>
      </div>`;
    await ui.openCard(html, {
      onOpen(body) {
        const paths = body.querySelectorAll('.greeting__flourish path');
        paths.forEach((path) => {
          const len = path.getTotalLength();
          gsap.fromTo(path, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 2.2, ease: 'power2.inOut', delay: 0.3 });
        });
        gsap.fromTo(
          body.querySelector('.greeting__title'),
          { clipPath: 'inset(-20% 100% -20% 0)', letterSpacing: '0.12em', filter: 'blur(6px)' },
          { clipPath: 'inset(-20% 0% -20% 0)', letterSpacing: '0em', filter: 'blur(0px)', duration: 2.2, ease: 'power3.out', delay: 0.4 }
        );
        gsap.from(body.querySelectorAll('.card__kicker, .card__text, .card__sig'), { opacity: 0, y: 10, duration: 1, stagger: 0.15, delay: 1.2 });
      },
    });
    clearInterval(ringTimer);
  },
};

/* --------------------------------------------------------------------------
   2. RED — a sealed letter that opens itself
   -------------------------------------------------------------------------- */
const letter = {
  async play(app, p) {
    const { ui, bursts } = app;
    const top = topOf(p);
    // a heart of drifting sparks over the box
    const heart = [];
    for (let i = 0; i < 90; i++) {
      const t = (i / 90) * Math.PI * 2;
      const x = 16 * Math.sin(t) ** 3;
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      heart.push(new THREE.Vector3(x * 0.035, 1.0 + y * 0.035, 0));
    }
    const cam = app.camera;
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(cam.matrixWorld));
    const pts = heart.map((v) => v.applyQuaternion(q).add(top));
    bursts.emit(top, { points: pts, count: pts.length, speed: 0.12, gravity: 0.08, drag: 2, life: 3.2, size: 0.11, colors: [0xff5a74, 0xffb0bd, 0xffe2a0] });

    const cfg = p.cfg;
    const html = `
      <p class="card__kicker">${esc(cfg.kicker)}</p>
      <h3 class="card__title" id="cardTitle">${esc(cfg.title)}</h3>
      <div class="envelope" aria-hidden="true">
        <div class="envelope__back"></div>
        <div class="envelope__paper">${esc(cfg.sealText || 'For you')}</div>
        <div class="envelope__front"></div>
        <div class="envelope__flap"></div>
        <div class="envelope__seal"><svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.5-9.2C1.2 8.6 3.4 5 6.9 5c2.1 0 3.6 1.2 5.1 3 1.5-1.8 3-3 5.1-3 3.5 0 5.7 3.6 4.4 6.8C19.5 16.4 12 21 12 21z"/></svg></div>
      </div>
      <div class="letter-body"></div>
      <p class="card__sig" style="opacity:0">${esc(cfg.signature || '')}</p>`;
    await ui.openCard(html, {
      onOpen(body) {
        const tl = gsap.timeline({ delay: 0.5 });
        tl.to(body.querySelector('.envelope__seal'), { scale: 1.25, duration: 0.25, ease: 'power2.out' })
          .to(body.querySelector('.envelope__seal'), { scale: 0, rotate: 50, opacity: 0, duration: 0.45, ease: 'power3.in' })
          .to(body.querySelector('.envelope__flap'), { rotateX: 180, duration: 0.8, ease: 'power2.inOut' }, '-=0.1')
          .set(body.querySelector('.envelope__flap'), { zIndex: 0 })
          .to(body.querySelector('.envelope__paper'), { y: -46, duration: 0.9, ease: 'power3.out' }, '-=0.2')
          .to(body.querySelector('.envelope'), { height: 110, marginBottom: 26, duration: 0.8, ease: 'power2.inOut' });
        // write the letter
        const holder = body.querySelector('.letter-body');
        const chars = [];
        String(cfg.text)
          .split(/\n\n+/)
          .forEach((para) => {
            const pEl = document.createElement('p');
            pEl.className = 'card__text letter-text';
            pEl.textContent = para;
            holder.appendChild(pEl);
            chars.push(...splitText(pEl));
          });
        tl.to(chars, { opacity: 1, duration: 0.05, stagger: 0.016, ease: 'none' }, '-=0.3');
        tl.to(body.querySelector('.card__sig'), { opacity: 1, duration: 1 });
        // let visitors skip the typing
        holder.addEventListener('click', () => tl.progress(1), { once: true });
      },
    });
  },
};

/* --------------------------------------------------------------------------
   3. EMERALD — a crystal snowflake that shatters into sparkles
   -------------------------------------------------------------------------- */
function snowflakeGeometry() {
  const parts = [];
  const bar = (len, w, x, y, rot) => {
    const g = new THREE.BoxGeometry(len, w, w * 0.6);
    g.translate(len / 2, 0, 0);
    g.rotateZ(rot);
    g.translate(x, y, 0);
    return g;
  };
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const arm = [];
    arm.push(bar(1, 0.06, 0, 0, 0));
    for (const [pos, len] of [
      [0.32, 0.3],
      [0.55, 0.24],
      [0.76, 0.16],
    ]) {
      arm.push(bar(len, 0.045, pos, 0, Math.PI / 3));
      arm.push(bar(len, 0.045, pos, 0, -Math.PI / 3));
    }
    const merged = mergeGeometries(arm);
    merged.rotateZ(a);
    parts.push(merged);
  }
  const hex = new THREE.CylinderGeometry(0.16, 0.16, 0.04, 6);
  hex.rotateX(Math.PI / 2);
  parts.push(hex);
  return mergeGeometries(parts);
}

const snowflake = {
  async play(app, p) {
    const { ui, bursts, audio, scene } = app;
    const top = topOf(p);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xe6f6ff,
      emissive: 0x7fd8ff,
      emissiveIntensity: 1.4,
      metalness: 0.3,
      roughness: 0.15,
      transparent: true,
    });
    const flake = new THREE.Mesh(snowflakeGeometry(), mat);
    const holder = new THREE.Group();
    holder.add(flake);
    const glow = glowSprite(0x9fe6ff, 3.2, 0.6);
    holder.add(glow);
    holder.position.copy(top);
    holder.scale.setScalar(0.05);
    holder.quaternion.copy(app.camera.quaternion);
    scene.add(holder);

    let spin = true;
    const spinTick = () => {
      if (spin) flake.rotation.z += 0.008;
    };
    gsap.ticker.add(spinTick);

    await gsap
      .timeline()
      .to(holder.position, { y: top.y + 1.5, duration: 2, ease: 'power3.out' }, 0)
      .to(holder.scale, { x: 0.85, y: 0.85, z: 0.85, duration: 2, ease: 'elastic.out(1, 0.6)' }, 0)
      .to(mat, { emissiveIntensity: 2.2, duration: 0.4, yoyo: true, repeat: 3 }, 1.2)
      .then();
    await wait(600);

    // transform into sparkling particles
    flake.updateMatrixWorld(true);
    const pos = flake.geometry.attributes.position;
    const pts = [];
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 3) {
      v.fromBufferAttribute(pos, i).applyMatrix4(flake.matrixWorld);
      pts.push(v.clone());
    }
    audio.play('sparkle');
    bursts.emit(top, { points: pts, count: Math.min(pts.length, 360), speed: 0.6, gravity: 0.35, drag: 1.2, life: 3.2, size: 0.09, colors: [0xdff6ff, 0xa8e4ff, 0xffffff, 0x9cffd6] });
    await gsap
      .timeline()
      .to(holder.scale, { x: 1.15, y: 1.15, z: 1.15, duration: 0.18, ease: 'power2.out' })
      .to(mat, { opacity: 0, duration: 0.25 }, 0.05)
      .to(glow.material, { opacity: 0, duration: 0.6 }, 0.05)
      .then();
    spin = false;
    gsap.ticker.remove(spinTick);
    scene.remove(holder);
    flake.geometry.dispose();
    mat.dispose();
    glow.material.dispose();

    const html = basicCard(p.cfg);
    await ui.openCard(html, { onOpen: animateCardIn });
  },
};

/* --------------------------------------------------------------------------
   4. SILVER — a shooting star crosses the Christmas sky
   -------------------------------------------------------------------------- */
const shootingStar = {
  async play(app, p) {
    const { ui, rig, env, audio, bursts, camera } = app;
    bursts.emit(topOf(p), { count: 60, shape: 'fountain', speed: 5, spread: 0.2, gravity: -0.5, life: 1.6, size: 0.1, colors: [0xffffff, 0xdfe9ff, 0xc0d0f0] });
    // turn away from the tree and look up into the open sky
    const look = new THREE.Vector3(camera.position.x, 0, camera.position.z).normalize();
    const pos = camera.position.clone();
    const target = pos.clone().add(look.clone().multiplyScalar(20)).add(new THREE.Vector3(0, 13, 0));
    rig.setLimits('locked'); // allow looking steeply upward (restored when the card closes)
    await rig.flyTo({ position: pos, target, duration: 2.2, arc: false, ease: 'power2.inOut' });
    // start a little to the right of centre; it travels right-to-left, gently falling
    const right = new THREE.Vector3().crossVectors(look, new THREE.Vector3(0, 1, 0)).normalize();
    const dir = look.clone().multiplyScalar(0.8).add(new THREE.Vector3(0, 0.66, 0)).add(right.multiplyScalar(0.3)).normalize();
    audio.play('shooting');
    env.shooting.launch({ dir, length: 95, width: 3.6, duration: 2.8, sweep: 0.5, big: true, color: 0xfff6e2 });
    await wait(1100);
    await ui.openCard(basicCard(p.cfg), { onOpen: animateCardIn });
  },
};

/* --------------------------------------------------------------------------
   5. BLUE — an interactive miniature snow globe
   -------------------------------------------------------------------------- */
const snowGlobe = {
  view: { distance: 4.6, height: 2.0, side: 0.4 },
  async play(app, p) {
    const { ui, scene, picker, audio, bursts } = app;
    const { createSnowGlobe } = await import('../scenes/snowGlobe.js');
    const globe = createSnowGlobe({ detail: 'mini', envMap: app.envMap });
    const top = topOf(p);
    globe.group.position.copy(top);
    globe.group.scale.setScalar(0.001);
    scene.add(globe.group);
    app.addUpdater(globe.update);
    bursts.emit(top, { count: 80, shape: 'fountain', speed: 3, spread: 0.3, gravity: -0.6, life: 2, size: 0.1, colors: [0x9cc8ff, 0xffffff, 0xffe2a0] });

    await gsap
      .timeline()
      .to(globe.group.position, { y: top.y + 1.25, duration: 1.8, ease: 'power3.out' }, 0)
      .to(globe.group.scale, { x: 0.7, y: 0.7, z: 0.7, duration: 1.8, ease: 'back.out(1.4)' }, 0)
      .then();

    const shake = () => {
      audio.play('shake');
      globe.shake();
      const g = globe.group;
      gsap.fromTo(g.rotation, { z: 0 }, { z: 0.22, duration: 0.09, yoyo: true, repeat: 7, ease: 'sine.inOut', onComplete: () => (g.rotation.z = 0) });
    };
    const unregister = picker.register({ object: globe.hit, tooltip: 'Shake me', onClick: shake });
    let floatTick = (dt) => {
      globe.group.rotation.y += dt * 0.25;
    };
    app.addUpdater(floatTick);
    setTimeout(shake, 500);

    const extra = `<div class="card__actions"><button type="button" class="btn-gold" data-shake>Shake the globe</button></div>`;
    await ui.openCard(basicCard(p.cfg, extra), {
      onOpen(body) {
        animateCardIn(body);
        body.querySelector('[data-shake]').addEventListener('click', shake);
      },
    });
    unregister();
    await gsap
      .timeline()
      .to(globe.group.position, { y: top.y, duration: 1, ease: 'power3.in' }, 0)
      .to(globe.group.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 1, ease: 'power3.in' }, 0)
      .then();
    app.removeUpdater(floatTick);
    app.removeUpdater(globe.update);
    scene.remove(globe.group);
    globe.dispose();
    floatTick = null;
  },
};

/* --------------------------------------------------------------------------
   6. SPECIAL — the grand surprise
   -------------------------------------------------------------------------- */
const grand = {
  view: { distance: 4.8, height: 1.8, side: 0 },
  async play(app, p, { firstTime }) {
    const { ui, rig, env, tree, audio, bursts } = app;
    // pull back for the full spectacle
    rig.setShift(0, 0, 1.6);
    await rig.flyTo({ position: new THREE.Vector3(0, 2.6, 27), target: new THREE.Vector3(0, 9.5, 0), duration: 2.6 });
    audio.duck(0.35, 1);

    const ground = env.ground.uniforms;
    ground.uRingCenter.value.copy(p.pos);
    const tl = gsap.timeline();
    tl.set(ground.uRing, { value: 1 }, 0)
      .fromTo(ground.uRingRadius, { value: 0 }, { value: 42, duration: 4.5, ease: 'power2.out' }, 0)
      .to(ground.uRing, { value: 0, duration: 4.5, ease: 'power2.in' }, 0)
      .fromTo(tree.fairy.uniforms.uWave, { value: -0.2 }, { value: 1.25, duration: 2.4, ease: 'sine.inOut', repeat: 1 }, 0.2)
      .set(tree.fairy.uniforms.uWave, { value: -1 }, 5.2)
      .to(tree.star, { flare: 1, duration: 0.8, ease: 'power2.out' }, 2.2)
      .to(tree.star, { flare: 0, duration: 2.5, ease: 'power2.inOut' }, 3.2)
      .add(() => app.setAurora(1, 5), 1.5);

    const colors = [
      [0xffd27a, 0xfff2d0, 0xffb347],
      [0xff6f86, 0xffd0d8, 0xffe2a0],
      [0xbfe6ff, 0xffffff, 0x8fc2ff],
      [0x7dffc4, 0xfff2d0, 0xffd27a],
    ];
    const shots = firstTime ? 7 : 4;
    for (let i = 0; i < shots; i++) {
      tl.add(() => {
        const pos = new THREE.Vector3((Math.random() - 0.5) * 22, 15 + Math.random() * 9, -6 - Math.random() * 10);
        audio.play('firework');
        bursts.emit(pos, { count: 170, speed: 6.5, drag: 1.3, gravity: -1.4, life: 2.4, size: 0.24, colors: colors[i % colors.length] });
      }, 1.0 + i * 0.55);
    }
    await wait(2600);

    const extra = `<div class="card__actions">
        <button type="button" class="btn-gold" data-finale>See the finale</button>
      </div>`;
    await ui.openCard(basicCard(p.cfg, extra), {
      onOpen(body) {
        animateCardIn(body);
        body.querySelector('[data-finale]').addEventListener('click', () => {
          app.pendingFinale = true;
          ui.closeCard();
        });
      },
    });
    audio.unduck();
  },
};

export const REVEALS = { greeting, letter, snowflake, shootingStar, snowGlobe, grand };
