import * as THREE from 'three';
import gsap from 'gsap';
import { escapeHTML as esc, splitText } from '../utils/helpers.js';
import { world } from '../core/world.js';
import { TREE } from '../scenes/christmasTree.js';
import { CameraRig } from '../core/cameraRig.js';

const ICONS = {
  cocoa: `<svg viewBox="0 0 120 120" aria-hidden="true">
      <path class="steam" d="M48 40c-6-8 6-12 0-20"/><path class="steam" d="M60 40c-6-8 6-12 0-20"/><path class="steam" d="M72 40c-6-8 6-12 0-20"/>
      <path class="stroke" d="M32 48h56v28a20 20 0 01-20 20H52a20 20 0 01-20-20z"/>
      <path class="stroke" d="M88 56h6a10 10 0 010 20h-7"/>
      <path class="stroke" d="M26 104h68"/>
    </svg>`,
  candle: `<svg viewBox="0 0 120 120" aria-hidden="true">
      <path class="flame" d="M60 18c8 10 10 17 4 24-3 3-9 3-12 0-6-7-2-14 8-24z"/>
      <path class="stroke" d="M60 44v6"/>
      <rect class="stroke" x="46" y="50" width="28" height="50" rx="3"/>
      <path class="stroke" d="M36 104h48"/>
      <path class="stroke" d="M50 62c4 3 16 3 20 0"/>
    </svg>`,
};

/**
 * Clickable magic ornaments: the camera glides toward the ornament, it spins
 * and glows, and a message or surprise floats into view.
 */
export function createOrnamentInteractions(app) {
  const { tree, rig, ui, audio, bursts, picker, snowfall } = app;
  let busy = false;

  for (const m of tree.magic) {
    picker.register({
      object: m.hit,
      enabled: () => !busy && app.mode === 'explore',
      tooltip: () => (m.seen ? `${m.cfg.kicker} — again` : { wish: 'A wish is hidden here', message: 'A hidden message…', surprise: 'Something stirs inside…', gift: 'A tiny gift' }[m.cfg.type]),
      onHover: (on) => gsap.to(m, { hover: on ? 1 : 0, duration: 0.4, ease: 'power2.out' }),
      onClick: () => open(m),
    });
  }

  function focusView(m) {
    const p = new THREE.Vector3();
    m.group.getWorldPosition(p);
    const out = new THREE.Vector3(p.x, 0, p.z).normalize();
    const target = p.clone();
    const position = p.clone().add(out.multiplyScalar(4.8 * CameraRig.portraitFactor())).add(new THREE.Vector3(0, 0.7, 0));
    return { position, target, world: p };
  }

  async function open(m) {
    if (busy || app.mode !== 'explore') return;
    busy = true;
    app.setMode('focus');
    ui.hideTooltip();
    const returnView = rig.saveView();
    const view = focusView(m);
    audio.play('magic');
    gsap.to(world, { timeScale: 0.3, duration: 1.2 });
    rig.setLimits('focus');
    rig.setShift(window.innerWidth > 860 ? -0.17 : 0, window.innerWidth > 860 ? 0 : 0.14, 1.4);
    gsap.to(m, { focus: 1, duration: 0.8 });
    m.spin = 6;
    await rig.flyTo({ position: view.position, target: view.target, duration: 1.5 });
    bursts.emit(view.world, { count: 70, speed: 2.2, life: 1.6, size: 0.08, gravity: 0.1, colors: [m.halo.material.color.getHex(), 0xfff4d8, 0xffe2a0] });

    const cfg = m.cfg;
    if (cfg.type === 'surprise') playSurprise(cfg, view.world);

    let html = '';
    if (cfg.type === 'gift') {
      html = `<div class="mini-gift">${ICONS[cfg.item] || ICONS.cocoa}</div>`;
    } else if (cfg.type === 'wish') {
      html = `<div class="wish-orb" aria-hidden="true"></div>`;
    }
    html += `
      <p class="card__kicker">${esc(cfg.kicker)}</p>
      <h3 class="card__title" id="cardTitle">${esc(cfg.title)}</h3>
      <p class="card__text">${esc(cfg.text)}</p>`;

    await ui.openCard(html, {
      onOpen(body) {
        const text = body.querySelector('.card__text');
        if (cfg.type === 'message') {
          // the hidden message slowly comes into focus, word by word
          const words = splitText(text, 'words');
          gsap.fromTo(words, { opacity: 0, filter: 'blur(8px)' }, { opacity: 1, filter: 'blur(0px)', duration: 1.1, stagger: 0.06, delay: 0.5, ease: 'power2.out' });
        } else {
          gsap.from(text, { opacity: 0, y: 10, duration: 1, delay: 0.4 });
        }
        gsap.from(body.querySelectorAll('.card__kicker, .card__title'), { opacity: 0, y: 12, duration: 0.9, stagger: 0.1, delay: 0.1 });
        const icon = body.querySelector('.mini-gift');
        if (icon) gsap.from(icon, { scale: 0.4, opacity: 0, rotate: -12, duration: 1.1, ease: 'back.out(2)', delay: 0.2 });
      },
    });

    m.seen = true;
    gsap.to(m, { focus: 0, duration: 0.8 });
    rig.setShift(0, 0, 1.3);
    gsap.to(world, { timeScale: 1, duration: 1.4 });
    rig.setLimits('tree');
    await rig.flyTo({ ...returnView, duration: 1.5 });
    busy = false;
    app.setMode('explore');
  }

  function playSurprise(cfg, from) {
    if (cfg.effect === 'snowburst') {
      audio.play('sleigh');
      const u = snowfall.uniforms.uIntensity;
      const before = u.value;
      gsap.timeline().to(u, { value: 1, duration: 1.2, ease: 'power2.out' }).to(u, { value: before, duration: 4, ease: 'power2.inOut' }, 5);
      gsap.timeline().to(snowfall.uniforms.uSpeed, { value: 2.4, duration: 0.6 }).to(snowfall.uniforms.uSpeed, { value: 1, duration: 3 }, 2.5);
      for (let i = 0; i < 6; i++) {
        setTimeout(() => bursts.emit(from, { count: 40, speed: 3, life: 2.2, size: 0.07, gravity: -0.2, colors: [0xffffff, 0xdfeeff, 0xbfe0ff] }), i * 180);
      }
      return;
    }
    // golden helix that climbs the tree and ignites the star
    audio.play('sparkle');
    const turns = 3;
    let i = 0;
    const total = 70;
    const startY = from.y;
    const tick = () => {
      if (i >= total) {
        gsap.ticker.remove(tick);
        gsap.timeline().to(tree.star, { flare: 1, duration: 0.5 }).to(tree.star, { flare: 0, duration: 2.2 });
        audio.play('bell');
        return;
      }
      const u = i / total;
      const y = startY + u * (TREE.yTop + 0.7 - startY);
      const r = (1 - (y - TREE.yBase) / (TREE.yTop - TREE.yBase)) * TREE.rBase + 0.9;
      const a = u * turns * Math.PI * 2 + Math.atan2(from.z, from.x);
      bursts.emit(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r), { count: 6, speed: 0.4, life: 2.4, size: 0.12, gravity: 0.2, colors: [0xffe2a0, 0xfff4d8, 0xffc45c] });
      i++;
    };
    gsap.ticker.add(tick);
  }

  return {
    get busy() {
      return busy;
    },
  };
}
