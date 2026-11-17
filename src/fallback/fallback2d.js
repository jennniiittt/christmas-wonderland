import gsap from 'gsap';
import { GIFTS } from '../config/gifts.js';
import { createUI } from '../ui/ui.js';
import { escapeHTML as esc } from '../utils/helpers.js';

/**
 * Lightweight 2D version for devices without WebGL: a painted night sky with
 * snow, a glowing tree drawn on canvas, and the presents and wishes as real,
 * working interactions.
 */
export function startFallback({ reason = '' } = {}) {
  const ac = new AbortController();
  const ui = createUI({ signal: ac.signal });
  ui.setProgress(1, 'Ready');
  ui.hideLoader();

  const scene = document.getElementById('scene');
  scene.style.display = 'none';
  const canvas = document.getElementById('fx2d');
  canvas.style.zIndex = '0';
  const ctx = canvas.getContext('2d');
  let W = 0;
  let H = 0;
  let dpr = 1;
  const resize = () => {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth;
    H = innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
  };
  resize();
  addEventListener('resize', resize, { signal: ac.signal });

  const stars = Array.from({ length: 220 }, () => ({ x: Math.random(), y: Math.random() * 0.75, r: Math.random() * 1.3 + 0.3, p: Math.random() * 6 }));
  const flakes = Array.from({ length: 160 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 2.2 + 0.6, s: Math.random() * 0.6 + 0.3, w: Math.random() * 6 }));
  const lights = Array.from({ length: 140 }, () => {
    const t = Math.random();
    return { t, u: (Math.random() - 0.5) * (0.15 + t * 0.85), p: Math.random() * 6, c: ['#ffd27a', '#fff0c8', '#ffb347'][(Math.random() * 3) | 0] };
  });
  let revealed = 0;

  function draw(time) {
    const t = time / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#02040b');
    sky.addColorStop(0.7, '#0d1a33');
    sky.addColorStop(1, '#1b2740');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    for (const s of stars) {
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 1.5 + s.p);
      ctx.fillStyle = '#fff6e0';
      ctx.fillRect(s.x * W, s.y * H, s.r, s.r);
    }
    ctx.globalAlpha = 1;
    // snowy ground
    ctx.fillStyle = '#c9d6ec';
    ctx.beginPath();
    ctx.ellipse(W / 2, H * 0.98, W * 0.9, H * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    // tree
    const cx = W / 2;
    const top = H * 0.16;
    const base = H * 0.86;
    const half = Math.min(W * 0.36, (base - top) * 0.42);
    const glow = ctx.createRadialGradient(cx, base - (base - top) * 0.35, 10, cx, base - (base - top) * 0.35, half * 1.8);
    glow.addColorStop(0, `rgba(255,170,80,${0.22 * revealed})`);
    glow.addColorStop(1, 'rgba(255,170,80,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 6; i++) {
      const y0 = top + (base - top) * (i / 6) * 0.95;
      const y1 = top + (base - top) * ((i + 1.4) / 6) * 0.95;
      const w1 = half * ((i + 1.4) / 6.4);
      const g = ctx.createLinearGradient(cx - w1, 0, cx + w1, 0);
      g.addColorStop(0, '#0a2416');
      g.addColorStop(0.5, '#1f5132');
      g.addColorStop(1, '#0a2416');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx, y0);
      ctx.quadraticCurveTo(cx + w1 * 0.6, y1 - (y1 - y0) * 0.3, cx + w1, y1);
      ctx.quadraticCurveTo(cx, y1 + 10, cx - w1, y1);
      ctx.quadraticCurveTo(cx - w1 * 0.6, y1 - (y1 - y0) * 0.3, cx, y0);
      ctx.fill();
    }
    ctx.fillStyle = '#3a2618';
    ctx.fillRect(cx - 12, base - 6, 24, 34);
    ctx.globalCompositeOperation = 'lighter';
    for (const l of lights) {
      if (l.t > revealed * 1.1) continue;
      const y = base - (base - top) * (1 - l.t) * 0.95;
      const x = cx + l.u * half * 2 * (1 - (1 - l.t) * 0.02);
      const a = 0.55 + 0.45 * Math.sin(t * 2 + l.p);
      const gl = ctx.createRadialGradient(x, y, 0, x, y, 9);
      gl.addColorStop(0, l.c);
      gl.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.globalAlpha = a;
      ctx.fillStyle = gl;
      ctx.fillRect(x - 9, y - 9, 18, 18);
    }
    // star
    const sg = ctx.createRadialGradient(cx, top - 8, 0, cx, top - 8, 70);
    sg.addColorStop(0, `rgba(255,240,200,${revealed})`);
    sg.addColorStop(0.2, `rgba(255,200,120,${0.6 * revealed})`);
    sg.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = sg;
    ctx.fillRect(cx - 70, top - 78, 140, 140);
    ctx.globalCompositeOperation = 'source-over';
    // snow
    ctx.fillStyle = 'rgba(240,246,255,0.85)';
    for (const f of flakes) {
      f.y += f.s * 0.0016;
      if (f.y > 1.02) f.y = -0.02;
      const x = (f.x + Math.sin(t * 0.6 + f.w) * 0.01) * W;
      ctx.beginPath();
      ctx.arc(x, f.y * H, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
    raf = requestAnimationFrame(draw);
  }
  let raf = requestAnimationFrame(draw);

  ui.showIntro();
  ui.el.sound.hidden = true; // no audio engine in the lightweight version
  const note = document.createElement('p');
  note.className = 'fallback-note';
  note.textContent = reason;
  document.body.appendChild(note);

  ui.el.enter.addEventListener(
    'click',
    async () => {
      await ui.hideIntro();
      gsap.to({ v: 0 }, { v: 1, duration: 3, onUpdate() { revealed = this.targets()[0].v; } });
      const row = document.createElement('div');
      row.className = 'fallback-gifts';
      const regular = GIFTS.filter((g) => !g.special);
      const opened = new Set();
      for (const g of GIFTS) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn-ghost';
        b.textContent = g.special ? `${g.name} (locked)` : g.name;
        b.addEventListener('click', () => {
          if (g.special && opened.size < regular.length) {
            ui.toast(`${opened.size} / ${regular.length} magical gifts discovered`);
            return;
          }
          if (!g.special) opened.add(g.id);
          if (opened.size === regular.length) row.lastChild.textContent = GIFTS.find((x) => x.special).name;
          ui.openCard(`<p class="card__kicker">${esc(g.kicker)}</p><h3 class="card__title" id="cardTitle">${esc(g.title)}</h3><p class="card__text">${esc(g.text).replace(/\n/g, '<br/>')}</p>${g.signature ? `<p class="card__sig">${esc(g.signature)}</p>` : ''}`);
        });
        row.appendChild(b);
      }
      document.body.appendChild(row);
    },
    { signal: ac.signal }
  );

  return () => {
    cancelAnimationFrame(raf);
    ac.abort();
  };
}
