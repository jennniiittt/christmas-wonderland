import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { makeCanvas, canvasTexture, glowSprite, blobShadow, mulberry32 } from '../utils/helpers.js';
import { makeBow } from '../utils/bow.js';
import { world } from '../core/world.js';

/* --------------------------------------------------------------------------
   Wrapping styles
   -------------------------------------------------------------------------- */
export const PRESENT_STYLES = {
  champagne: { paper: drawChampagne, ribbon: '#f4e8cf', ribbonEdge: '#d8bf8a', metal: 0.4, rough: 0.36, glow: 0xffd590 },
  ruby: { paper: drawRuby, ribbon: '#e2be6c', ribbonEdge: '#fff0c2', metal: 0.15, rough: 0.42, glow: 0xff6f86 },
  emerald: { paper: drawEmerald, ribbon: '#a3192f', ribbonEdge: '#e4c57e', metal: 0.15, rough: 0.45, glow: 0x6cffc0 },
  silver: { paper: drawSilver, ribbon: '#a51a31', ribbonEdge: '#f0d9a6', metal: 0.45, rough: 0.3, glow: 0xdfe9ff },
  midnight: { paper: drawMidnight, ribbon: '#e3e8f0', ribbonEdge: '#ffffff', metal: 0.2, rough: 0.4, glow: 0x8cb8ff },
  royal: { paper: drawRoyal, ribbon: '#7e0d20', ribbonEdge: '#f2cf7d', metal: 0.55, rough: 0.28, glow: 0xffc65c },
};

function star4(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rr = i % 2 ? r * 0.28 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}
function star5(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.42 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function drawChampagne(ctx, S) {
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, '#e2c88e');
  g.addColorStop(0.5, '#cfae6b');
  g.addColorStop(1, '#e6cf9c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = '#fff6df';
  ctx.lineWidth = 10;
  for (let i = -S; i < S * 2; i += 42) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + S, S);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(255,248,226,0.85)';
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) star4(ctx, (x + (y % 2) * 0.5) * (S / 8) + 16, y * (S / 8) + 16, 7);
}
function drawRuby(ctx, S) {
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.8);
  g.addColorStop(0, '#a3172f');
  g.addColorStop(1, '#6e0d1e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#e2bc6a';
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 10; x++) {
      ctx.beginPath();
      ctx.arc((x + (y % 2) * 0.5) * (S / 10), y * (S / 10) + S / 20, 4.2, 0, Math.PI * 2);
      ctx.fill();
    }
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#000';
  for (let y = 0; y < S; y += 4) ctx.fillRect(0, y, S, 1);
  ctx.globalAlpha = 1;
}
function drawEmerald(ctx, S) {
  ctx.fillStyle = '#0d4630';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = 'rgba(4,30,20,0.55)';
  for (let i = 0; i < S; i += 128) {
    ctx.fillRect(i + 40, 0, 48, S);
    ctx.fillRect(0, i + 40, S, 48);
  }
  ctx.strokeStyle = 'rgba(232,200,130,0.8)';
  ctx.lineWidth = 2;
  for (let i = 0; i < S; i += 128) {
    for (const o of [24, 30]) {
      ctx.beginPath();
      ctx.moveTo(i + o, 0);
      ctx.lineTo(i + o, S);
      ctx.moveTo(0, i + o);
      ctx.lineTo(S, i + o);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = 'rgba(160,30,50,0.6)';
  ctx.lineWidth = 3;
  for (let i = 0; i < S; i += 128) {
    ctx.beginPath();
    ctx.moveTo(i + 100, 0);
    ctx.lineTo(i + 100, S);
    ctx.moveTo(0, i + 100);
    ctx.lineTo(S, i + 100);
    ctx.stroke();
  }
}
function snowflake(ctx, x, y, r) {
  ctx.save();
  ctx.translate(x, y);
  for (let i = 0; i < 6; i++) {
    ctx.rotate(Math.PI / 3);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(r, 0);
    ctx.moveTo(r * 0.55, 0);
    ctx.lineTo(r * 0.75, r * 0.2);
    ctx.moveTo(r * 0.55, 0);
    ctx.lineTo(r * 0.75, -r * 0.2);
    ctx.stroke();
  }
  ctx.restore();
}
function drawSilver(ctx, S) {
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, '#d9dee7');
  g.addColorStop(0.5, '#b7bfcc');
  g.addColorStop(1, '#dfe4ec');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  const rnd = mulberry32(3);
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) snowflake(ctx, (x + (y % 2) * 0.5) * (S / 5) + 30, y * (S / 5) + 50, 18 + rnd() * 8);
}
function drawMidnight(ctx, S) {
  const g = ctx.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, '#14275a');
  g.addColorStop(1, '#0a1534');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const rnd = mulberry32(8);
  ctx.fillStyle = '#e8c88a';
  for (let i = 0; i < 46; i++) star5(ctx, rnd() * S, rnd() * S, 3 + rnd() * 8);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  for (let i = 0; i < 160; i++) ctx.fillRect(rnd() * S, rnd() * S, 1.5, 1.5);
}
function drawRoyal(ctx, S) {
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, '#e9c46f');
  g.addColorStop(0.45, '#c08d32');
  g.addColorStop(1, '#f0d388');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(255,244,210,0.55)';
  ctx.lineWidth = 3;
  const step = S / 6;
  for (let i = -6; i < 12; i++) {
    ctx.beginPath();
    ctx.moveTo(i * step, 0);
    ctx.lineTo(i * step + S, S);
    ctx.moveTo(i * step + S, 0);
    ctx.lineTo(i * step, S);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(120,70,10,0.45)';
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) star4(ctx, x * step + step / 2, y * step, 9);
}

function ribbonTexture(color, edge) {
  const [c, ctx] = makeCanvas(64, 64);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, 4, 64);
  ctx.fillRect(60, 0, 4, 64);
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#fff';
  ctx.fillRect(18, 0, 10, 64);
  ctx.globalAlpha = 1;
  return canvasTexture(c);
}

const paperCache = new Map();
function paperTexture(style) {
  if (paperCache.has(style)) return paperCache.get(style);
  const [c, ctx] = makeCanvas(512);
  PRESENT_STYLES[style].paper(ctx, 512);
  const t = canvasTexture(c, { repeat: [1, 1], anisotropy: 8 });
  paperCache.set(style, t);
  return t;
}

/* --------------------------------------------------------------------------
   Light beam that pours out of an opened present
   -------------------------------------------------------------------------- */
function createBeam(radius, color) {
  const geo = new THREE.CylinderGeometry(radius * 1.8, radius * 0.7, 4, 32, 1, true);
  geo.translate(0, 2, 0);
  const uniforms = { uTime: world.uniforms.uTime, uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uOpacity; uniform vec3 uColor; varying vec2 vUv;
      float h(float n){ return fract(sin(n)*43758.5453); }
      float n1(float x){ float i=floor(x); float f=fract(x); f=f*f*(3.-2.*f); return mix(h(i),h(i+1.),f); }
      void main(){
        float streak = 0.55 + 0.45 * n1(vUv.x * 40.0 + uTime * 0.8) * n1(vUv.x * 17.0 - uTime * 0.5);
        float fade = pow(1.0 - vUv.y, 1.6) * smoothstep(0.0, 0.05, vUv.y);
        gl_FragColor = vec4(uColor * streak * fade * uOpacity * 1.2, 1.0);
      }
    `,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 7;
  m.visible = false;
  return { mesh: m, uniforms };
}

/* --------------------------------------------------------------------------
   Padlock (special present)
   -------------------------------------------------------------------------- */
function createLock() {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0xc9a25a, metalness: 1, roughness: 0.28, emissive: 0x3a2508, emissiveIntensity: 0.6, transparent: true });
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.28, 0.12, 3, 0.04), metal);
  g.add(body);
  const shacklePivot = new THREE.Group();
  shacklePivot.position.set(-0.09, 0.14, 0);
  const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.022, 10, 24, Math.PI), metal);
  shackle.position.set(0.09, 0.02, 0);
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.06, 8), metal);
  legs.position.set(0.18, -0.01, 0);
  const legs2 = legs.clone();
  legs2.position.x = 0;
  shacklePivot.add(shackle, legs, legs2);
  g.add(shacklePivot);
  const hole = new THREE.Mesh(
    new THREE.CircleGeometry(0.03, 16),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true })
  );
  hole.position.set(0, -0.01, 0.062);
  g.add(hole);
  const glow = glowSprite(0xffcf7a, 1.1, 0.5);
  g.add(glow);
  return { group: g, shacklePivot, metal, hole, glow };
}

/* --------------------------------------------------------------------------
   Gift box
   -------------------------------------------------------------------------- */
export function createGiftBox({ size, style, special = false }) {
  const st = PRESENT_STYLES[style];
  const [w, h, d] = size;
  const hl = Math.min(0.26, h * 0.2); // lid height
  const hb = h - hl * 0.6; // body height

  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);

  const paper = paperTexture(style);
  const paperMat = new THREE.MeshPhysicalMaterial({
    map: paper,
    metalness: st.metal,
    roughness: st.rough,
    clearcoat: 0.35,
    clearcoatRoughness: 0.35,
    emissive: new THREE.Color(st.glow),
    emissiveIntensity: 0,
    envMapIntensity: 1.6,
  });
  const ribbonMat = new THREE.MeshStandardMaterial({
    map: ribbonTexture(st.ribbon, st.ribbonEdge),
    metalness: 0.35,
    roughness: 0.38,
    side: THREE.DoubleSide,
    transparent: true,
  });

  const body = new THREE.Mesh(new RoundedBoxGeometry(w, hb, d, 3, 0.035), paperMat);
  body.position.y = hb / 2;
  inner.add(body);

  // inner darkness + glow seen once the lid is off
  const cavity = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 0.94, d * 0.94),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(st.glow).multiplyScalar(0.6), transparent: true, opacity: 0 })
  );
  cavity.rotation.x = -Math.PI / 2;
  cavity.position.y = hb + 0.002;
  inner.add(cavity);

  // ribbons on the body (origin at the bottom, so they can slip down)
  const rw = Math.min(w, d) * 0.16;
  const bodyRibbons = new THREE.Group();
  const bandA = new THREE.BoxGeometry(w + 0.012, hb, rw);
  bandA.translate(0, hb / 2, 0);
  const bandB = new THREE.BoxGeometry(rw, hb, d + 0.012);
  bandB.translate(0, hb / 2, 0);
  bodyRibbons.add(new THREE.Mesh(bandA, ribbonMat), new THREE.Mesh(bandB, ribbonMat));
  inner.add(bodyRibbons);

  // lid
  const lidPivot = new THREE.Group();
  lidPivot.position.y = hb;
  inner.add(lidPivot);
  const lid = new THREE.Mesh(new RoundedBoxGeometry(w * 1.045, hl, d * 1.045, 3, 0.03), paperMat);
  lid.position.y = hl * 0.1;
  lidPivot.add(lid);
  const lidRibbons = new THREE.Group();
  lidRibbons.add(
    new THREE.Mesh(new THREE.BoxGeometry(w * 1.045 + 0.014, hl + 0.012, rw), ribbonMat),
    new THREE.Mesh(new THREE.BoxGeometry(rw, hl + 0.012, d * 1.045 + 0.014), ribbonMat)
  );
  lidRibbons.position.y = hl * 0.1;
  lidPivot.add(lidRibbons);

  // the glowing seam between lid and box ("its lights glow")
  const seamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(st.glow), transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false });
  const seam = new THREE.Mesh(new THREE.BoxGeometry(w * 1.06, 0.018, d * 1.06), seamMat);
  seam.position.y = -hl * 0.38;
  lidPivot.add(seam);

  const bowSize = Math.min(w, d) * (special ? 1.6 : 1.35);
  const bow = makeBow({ size: bowSize, material: ribbonMat });
  bow.position.y = hl * 0.6 + 0.005;
  bow.rotation.y = Math.PI / 4;
  lidPivot.add(bow);

  // glow sprites
  const halo = glowSprite(st.glow, Math.max(w, d) * 3.2, 0.18);
  halo.position.y = h * 0.45;
  inner.add(halo);
  const coreGlow = glowSprite(st.glow, Math.max(w, d) * 1.6, 0);
  coreGlow.position.y = hb + 0.05;
  inner.add(coreGlow);

  const beam = createBeam(Math.min(w, d) * 0.45, st.glow);
  beam.mesh.position.y = hb;
  inner.add(beam.mesh);

  const shadow = blobShadow(Math.max(w, d) * 2.0, 0.65);
  shadow.position.y = 0.012;
  root.add(shadow);

  const hit = new THREE.Mesh(
    new THREE.BoxGeometry(w * 1.35, h * 1.5, d * 1.35),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hit.position.y = h * 0.65;
  root.add(hit);

  let lock = null;
  if (special) {
    lock = createLock();
    lock.group.position.set(0, h + 0.75, 0);
    lock.group.scale.setScalar(1.4);
    root.add(lock.group);
  }

  return {
    root,
    inner,
    body,
    lidPivot,
    lid,
    lidRibbons,
    bodyRibbons,
    bow,
    seam,
    seamMat,
    halo,
    coreGlow,
    cavity,
    beam,
    shadow,
    hit,
    lock,
    paperMat,
    ribbonMat,
    glowColor: new THREE.Color(st.glow),
    dims: { w, h, d, hb, hl },
  };
}
