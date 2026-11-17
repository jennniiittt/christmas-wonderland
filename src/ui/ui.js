import gsap from 'gsap';
import { splitText } from '../utils/helpers.js';

const $ = (id) => document.getElementById(id);

/**
 * All DOM-side UI: loader, intro, HUD, dock, tooltip, reveal card, toasts.
 * Visibility is driven by gsap so every transition is smooth and interruptible.
 */
export function createUI({ signal }) {
  const el = {
    loader: $('loader'),
    loaderBar: document.querySelector('.loader__bar'),
    loaderLabel: $('loaderLabel'),
    loaderPct: $('loaderPct'),
    intro: $('intro'),
    introTitle: $('introTitle'),
    enter: $('enterBtn'),
    sound: $('soundBtn'),
    hud: $('hud'),
    giftCount: $('giftCount'),
    giftCounter: $('giftCounter'),
    dock: $('dock'),
    lights: $('lightsPanel'),
    tooltip: $('tooltip'),
    card: $('card'),
    cardBody: document.querySelector('#card .card__body'),
    cardClose: document.querySelector('#card .card__close'),
    hint: $('hint'),
    toast: $('toast'),
    fade: $('fade'),
  };

  /* ---------- loader ---------- */
  const CIRC = 339.3;
  function setProgress(p, label) {
    const pct = Math.round(p * 100);
    el.loaderBar.style.strokeDashoffset = String(CIRC * (1 - p));
    el.loaderPct.textContent = `${pct}%`;
    if (label) el.loaderLabel.textContent = label;
  }
  function hideLoader() {
    el.loader.classList.add('is-done');
    setTimeout(() => (el.loader.hidden = true), 1300);
  }

  /* ---------- intro ---------- */
  const titleChars = splitText(el.introTitle);
  function showIntro() {
    el.intro.hidden = false;
    el.sound.hidden = false;
    const tl = gsap.timeline({ delay: 0.3 });
    tl.from('.eyebrow', { opacity: 0, y: 12, duration: 1.4, ease: 'power2.out' })
      .from(
        titleChars,
        { opacity: 0, y: 34, rotateX: -60, filter: 'blur(10px)', duration: 1.6, ease: 'power3.out', stagger: 0.045 },
        0.3
      )
      .from('.flourish', { opacity: 0, scaleX: 0.2, duration: 1.4, ease: 'power3.out' }, 1.2)
      .from('.intro__subtitle', { opacity: 0, y: 14, duration: 1.4, ease: 'power2.out' }, 1.5)
      .from(el.enter, { opacity: 0, y: 18, scale: 0.94, duration: 1.3, ease: 'power3.out' }, 1.9)
      .from('.intro__hint', { opacity: 0, duration: 1.2 }, 2.4)
      .from(el.sound, { opacity: 0, duration: 1 }, 2.4);
    return tl;
  }
  function hideIntro() {
    return new Promise((resolve) => {
      gsap
        .timeline({ onComplete: resolve })
        .to(el.enter, { scale: 1.08, opacity: 0, duration: 0.8, ease: 'power2.in' }, 0)
        .to(
          titleChars,
          { opacity: 0, y: -20, filter: 'blur(8px)', duration: 0.9, ease: 'power2.in', stagger: { each: 0.02, from: 'center' } },
          0
        )
        .to(['.eyebrow', '.flourish', '.intro__subtitle', '.intro__hint'], { opacity: 0, y: -10, duration: 0.8, ease: 'power2.in' }, 0.1)
        .add(() => (el.intro.hidden = true));
    });
  }

  /* ---------- HUD & dock ---------- */
  function showHUD() {
    el.hud.hidden = false;
    el.dock.hidden = false;
    gsap.fromTo(el.hud, { opacity: 0, y: -12 }, { opacity: 1, y: 0, duration: 1.4, ease: 'power3.out' });
    gsap.fromTo(el.dock, { opacity: 0 }, { opacity: 1, duration: 1.4, ease: 'power3.out', delay: 0.2, clearProps: 'opacity' });
  }
  function setDockAway(away) {
    el.dock.classList.toggle('is-away', away);
    if (away) closeLights();
  }
  function setHUDVisible(v) {
    gsap.to(el.hud, { opacity: v ? 1 : 0, duration: 0.8, ease: 'power2.out' });
  }

  function setGiftCount(n, total) {
    el.giftCount.textContent = String(n);
    el.giftCounter.querySelectorAll('.gift-counter__pips i').forEach((p, i) => p.classList.toggle('on', i < n));
    el.giftCounter.classList.toggle('is-complete', n >= total);
    el.giftCounter.classList.remove('bump');
    void el.giftCounter.offsetWidth;
    el.giftCounter.classList.add('bump');
  }

  /* ---------- lights panel ---------- */
  const lightsBtn = el.dock.querySelector('[data-action="lights"]');
  function openLights() {
    el.lights.hidden = false;
    lightsBtn.setAttribute('aria-expanded', 'true');
    gsap.fromTo(el.lights, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' });
  }
  function closeLights() {
    if (el.lights.hidden) return;
    lightsBtn.setAttribute('aria-expanded', 'false');
    gsap.to(el.lights, { opacity: 0, y: 10, duration: 0.3, ease: 'power2.in', onComplete: () => (el.lights.hidden = true) });
  }
  function toggleLights() {
    if (el.lights.hidden) openLights();
    else closeLights();
  }
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!el.lights.hidden && !el.lights.contains(e.target) && !lightsBtn.contains(e.target)) closeLights();
    },
    { signal }
  );

  /* ---------- tooltip ---------- */
  let tipText = '';
  function showTooltip(text, x, y) {
    if (text !== tipText) {
      el.tooltip.textContent = text;
      tipText = text;
    }
    el.tooltip.hidden = false;
    el.tooltip.style.left = `${x}px`;
    el.tooltip.style.top = `${y}px`;
  }
  function hideTooltip() {
    el.tooltip.hidden = true;
    tipText = '';
  }

  /* ---------- hint ---------- */
  let hintTimer = null;
  function hint(text, ms = 5200) {
    clearTimeout(hintTimer);
    el.hint.textContent = text;
    el.hint.classList.add('is-visible');
    if (ms) hintTimer = setTimeout(() => el.hint.classList.remove('is-visible'), ms);
  }
  function clearHint() {
    clearTimeout(hintTimer);
    el.hint.classList.remove('is-visible');
  }

  /* ---------- toast ---------- */
  let toastTimer = null;
  function toast(text, ms = 4200) {
    clearTimeout(toastTimer);
    el.toast.textContent = text;
    el.toast.classList.add('is-visible');
    toastTimer = setTimeout(() => el.toast.classList.remove('is-visible'), ms);
  }

  /* ---------- reveal card ---------- */
  let cardResolve = null;
  let cardOpen = false;
  function openCard(html, { onOpen } = {}) {
    if (cardOpen) closeCardNow();
    el.cardBody.innerHTML = html;
    el.card.hidden = false;
    cardOpen = true;
    gsap.killTweensOf(el.card);
    gsap.fromTo(
      el.card,
      { opacity: 0, filter: 'blur(10px)', scale: 0.96 },
      { opacity: 1, filter: 'blur(0px)', scale: 1, duration: 0.9, ease: 'power3.out', clearProps: 'filter,scale' }
    );
    onOpen?.(el.cardBody);
    setTimeout(() => el.cardClose.focus({ preventScroll: true }), 50);
    return new Promise((r) => (cardResolve = r));
  }
  function closeCardNow() {
    el.card.hidden = true;
    cardOpen = false;
    const r = cardResolve;
    cardResolve = null;
    r?.();
  }
  function closeCard() {
    if (!cardOpen) return;
    cardOpen = false;
    gsap.to(el.card, {
      opacity: 0,
      y: 10,
      duration: 0.45,
      ease: 'power2.in',
      onComplete: () => {
        el.card.hidden = true;
        gsap.set(el.card, { clearProps: 'y,opacity' });
        const r = cardResolve;
        cardResolve = null;
        r?.();
      },
    });
  }
  el.cardClose.addEventListener('click', closeCard, { signal });
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && cardOpen) closeCard();
      if (e.key === 'Escape') closeLights();
    },
    { signal }
  );

  /* ---------- fade ---------- */
  function fadeOut(d = 0.7) {
    return gsap.to(el.fade, { opacity: 1, duration: d, ease: 'power2.inOut' }).then();
  }
  function fadeIn(d = 0.9) {
    return gsap.to(el.fade, { opacity: 0, duration: d, ease: 'power2.inOut' }).then();
  }

  /* ---------- sound button ---------- */
  function setSoundState(on) {
    el.sound.setAttribute('aria-pressed', on ? 'true' : 'false');
    el.sound.setAttribute('aria-label', on ? 'Mute sound' : 'Unmute sound');
  }

  return {
    el,
    setProgress,
    hideLoader,
    showIntro,
    hideIntro,
    showHUD,
    setHUDVisible,
    setDockAway,
    setGiftCount,
    toggleLights,
    closeLights,
    showTooltip,
    hideTooltip,
    hint,
    clearHint,
    toast,
    openCard,
    closeCard,
    get cardOpen() {
      return cardOpen;
    },
    fadeOut,
    fadeIn,
    setSoundState,
  };
}
