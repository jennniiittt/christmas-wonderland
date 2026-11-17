/**
 * A subtle trail of golden sparkles behind the mouse cursor (fine pointers
 * only). Its animation loop only runs while sparkles are alive.
 */
export function createCursorTrail(canvas, { signal }) {
  const fine = matchMedia('(pointer: fine)').matches;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!fine || reduced) return { enabled: false, setEnabled() {} };

  const ctx = canvas.getContext('2d');
  let dpr = 1;
  const parts = [];
  let raf = 0;
  let enabled = true;
  let last = null;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
  }
  resize();
  window.addEventListener('resize', resize, { signal });

  window.addEventListener(
    'pointermove',
    (e) => {
      if (!enabled || e.pointerType !== 'mouse') return;
      const dist = last ? Math.hypot(e.clientX - last.x, e.clientY - last.y) : 0;
      last = { x: e.clientX, y: e.clientY };
      const n = Math.min(3, Math.floor(dist / 9));
      for (let i = 0; i < n; i++) {
        parts.push({
          x: e.clientX + (Math.random() - 0.5) * 6,
          y: e.clientY + (Math.random() - 0.5) * 6,
          vx: (Math.random() - 0.5) * 18,
          vy: (Math.random() - 0.5) * 18 + 10,
          life: 0.7 + Math.random() * 0.4,
          max: 1.1,
          r: 0.7 + Math.random() * 1.4,
          hue: Math.random(),
        });
      }
      if (parts.length > 160) parts.splice(0, parts.length - 160);
      if (!raf && parts.length) {
        prev = performance.now();
        raf = requestAnimationFrame(frame);
      }
    },
    { signal, passive: true }
  );

  let prev = 0;
  function frame(now) {
    const dt = Math.min((now - prev) / 1000, 0.05);
    prev = now;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        parts.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
      const a = Math.min(1, p.life / 0.5);
      const r = p.r * (0.5 + a * 0.6);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 4);
      const tint = p.hue > 0.8 ? '255,250,235' : '255,214,140';
      g.addColorStop(0, `rgba(${tint},${0.95 * a})`);
      g.addColorStop(0.3, `rgba(${tint},${0.35 * a})`);
      g.addColorStop(1, `rgba(${tint},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(p.x - r * 4, p.y - r * 4, r * 8, r * 8);
    }
    if (parts.length) raf = requestAnimationFrame(frame);
    else {
      raf = 0;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
    }
  }

  signal.addEventListener('abort', () => cancelAnimationFrame(raf));

  return {
    enabled: true,
    setEnabled(v) {
      enabled = v;
    },
  };
}
