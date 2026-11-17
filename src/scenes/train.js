import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { glowSprite, glowTexture } from '../utils/helpers.js';
import { groundHeightNear } from './environment.js';

/**
 * A little Christmas train that circles the tree: locomotive, a wagon of
 * presents, a flat car carrying a tiny lit tree, and a caboose. Click it for a
 * jingle and a puff of steam.
 */
export function createTrain({ radius = 10.2 } = {}) {
  const group = new THREE.Group();
  group.name = 'train';
  const y0 = groundHeightNear(radius) + 0.02;

  const M = {
    red: new THREE.MeshPhysicalMaterial({ color: 0x8c1424, roughness: 0.35, metalness: 0.2, clearcoat: 0.8 }),
    green: new THREE.MeshPhysicalMaterial({ color: 0x154a33, roughness: 0.4, metalness: 0.2, clearcoat: 0.6 }),
    black: new THREE.MeshStandardMaterial({ color: 0x15161b, roughness: 0.5, metalness: 0.6 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd7b064, roughness: 0.25, metalness: 1 }),
    window: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 1.35, 0.6) }),
    rail: new THREE.MeshStandardMaterial({ color: 0x8d8f99, roughness: 0.3, metalness: 1 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x3b2618, roughness: 0.9 }),
    snow: new THREE.MeshStandardMaterial({ color: 0xf0f4fa, roughness: 0.9 }),
  };

  /* ---------- track ---------- */
  for (const r of [radius - 0.2, radius + 0.2]) {
    const rail = new THREE.Mesh(new THREE.TorusGeometry(r, 0.028, 6, 220), M.rail);
    rail.rotation.x = Math.PI / 2;
    rail.position.y = y0 + 0.06;
    group.add(rail);
  }
  const sleeperCount = Math.round((Math.PI * 2 * radius) / 0.32);
  const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.11, 0.04, 0.62), M.wood, sleeperCount);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < sleeperCount; i++) {
    const a = (i / sleeperCount) * Math.PI * 2;
    m4.makeRotationY(-a).setPosition(Math.cos(a) * radius, y0 + 0.02, Math.sin(a) * radius);
    sleepers.setMatrixAt(i, m4);
  }
  group.add(sleepers);

  /* ---------- rolling stock ---------- */
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.05, 16);
  wheelGeo.rotateX(Math.PI / 2);
  const addWheels = (car, xs, r = 0.12) => {
    for (const x of xs)
      for (const z of [-0.24, 0.24]) {
        const w = new THREE.Mesh(wheelGeo, M.red);
        w.scale.setScalar(r / 0.12);
        w.position.set(x, r + 0.03, z);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.06, 8).rotateX(Math.PI / 2), M.gold);
        w.add(hub);
        car.add(w);
        wheels.push(w);
      }
  };

  function locomotive() {
    const g = new THREE.Group();
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 0.46), M.black);
    chassis.position.y = 0.26;
    g.add(chassis);
    const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.78, 20).rotateZ(Math.PI / 2), M.red);
    boiler.position.set(0.18, 0.5, 0);
    g.add(boiler);
    for (const x of [-0.1, 0.18, 0.46]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.203, 0.012, 6, 24).rotateY(Math.PI / 2), M.gold);
      band.position.set(x, 0.5, 0);
      g.add(band);
    }
    const smokebox = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.12, 20).rotateZ(Math.PI / 2), M.black);
    smokebox.position.set(0.62, 0.5, 0);
    g.add(smokebox);
    const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.06, 0.26, 12), M.black);
    chimney.position.set(0.5, 0.8, 0);
    g.add(chimney);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.015, 6, 16).rotateX(Math.PI / 2), M.gold);
    rim.position.set(0.5, 0.93, 0);
    g.add(rim);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), M.gold);
    dome.position.set(0.24, 0.7, 0);
    g.add(dome);
    const cab = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.5, 0.5, 2, 0.03), M.red);
    cab.position.set(-0.36, 0.58, 0);
    g.add(cab);
    const roof = new THREE.Mesh(new RoundedBoxGeometry(0.52, 0.05, 0.6, 2, 0.02), M.black);
    roof.position.set(-0.36, 0.86, 0);
    g.add(roof);
    const snowRoof = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.03, 0.54, 2, 0.015), M.snow);
    snowRoof.position.set(-0.36, 0.895, 0);
    g.add(snowRoof);
    for (const z of [-0.252, 0.252]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.18), M.window);
      w.position.set(-0.36, 0.66, z);
      if (z < 0) w.rotation.y = Math.PI;
      g.add(w);
    }
    const cow = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.22, 4).rotateZ(-Math.PI / 2).rotateX(Math.PI / 4), M.gold);
    cow.position.set(0.72, 0.2, 0);
    cow.scale.set(1, 0.8, 1.3);
    g.add(cow);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 12).rotateZ(Math.PI / 2), M.window);
    lamp.position.set(0.7, 0.66, 0);
    g.add(lamp);
    const lampGlow = glowSprite(0xffd28a, 1.2, 0.9);
    lampGlow.position.set(0.78, 0.66, 0);
    g.add(lampGlow);
    addWheels(g, [0.42, 0.08], 0.14);
    addWheels(g, [-0.32], 0.15);
    g.userData.chimney = new THREE.Vector3(0.5, 0.98, 0);
    return g;
  }

  function wagon(kind) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.08, 0.46), M.black);
    base.position.y = 0.26;
    g.add(base);
    if (kind === 'presents') {
      const tub = new THREE.Mesh(new RoundedBoxGeometry(0.84, 0.24, 0.46, 2, 0.03), M.green);
      tub.position.y = 0.42;
      g.add(tub);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.025, 0.48), M.gold);
      trim.position.y = 0.55;
      g.add(trim);
      const cols = [0xc9a14e, 0x8c1424, 0xdfe5ee, 0x1d3a7a];
      [
        [-0.2, 0.2, 0.18],
        [0.12, 0.24, 0.2],
        [0.0, 0.16, 0.14],
        [0.28, 0.14, 0.12],
      ].forEach(([x, s, h], i) => {
        const b = new THREE.Mesh(new RoundedBoxGeometry(s, h, s, 2, 0.015), new THREE.MeshStandardMaterial({ color: cols[i], roughness: 0.4, metalness: 0.3 }));
        b.position.set(x, 0.55 + h / 2, (i % 2 ? 0.06 : -0.06));
        b.rotation.y = i * 0.6;
        g.add(b);
        const rib = new THREE.Mesh(new THREE.BoxGeometry(s * 1.02, h * 1.02, 0.03), M.gold);
        rib.position.copy(b.position);
        rib.rotation.copy(b.rotation);
        g.add(rib);
      });
    } else if (kind === 'tree') {
      const flat = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.06, 0.48), M.wood);
      flat.position.y = 0.33;
      g.add(flat);
      for (const [r, h, y] of [
        [0.26, 0.3, 0.36],
        [0.2, 0.28, 0.56],
        [0.13, 0.24, 0.74],
      ]) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 10), new THREE.MeshLambertMaterial({ color: 0x184a2c }));
        c.position.y = y + h / 2;
        g.add(c);
      }
      const pts = [];
      const col = [];
      const cc = new THREE.Color();
      for (let i = 0; i < 26; i++) {
        const t = Math.random();
        const a = Math.random() * Math.PI * 2;
        const r = (1 - t) * 0.24 + 0.03;
        pts.push(Math.cos(a) * r, 0.4 + t * 0.55, Math.sin(a) * r);
        cc.set([0xffc66b, 0xff5a6a, 0x7fd0ff][i % 3]).multiplyScalar(2);
        col.push(cc.r, cc.g, cc.b);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.09, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
      const star = glowSprite(0xffe0a0, 0.4, 1);
      star.position.y = 1.02;
      g.add(star);
    } else {
      const body = new THREE.Mesh(new RoundedBoxGeometry(0.8, 0.44, 0.46, 2, 0.03), M.red);
      body.position.y = 0.52;
      g.add(body);
      const roof = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.05, 0.54, 2, 0.02), M.black);
      roof.position.y = 0.77;
      g.add(roof);
      const cupola = new THREE.Mesh(new RoundedBoxGeometry(0.28, 0.16, 0.36, 2, 0.02), M.red);
      cupola.position.y = 0.86;
      g.add(cupola);
      const snowTop = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.03, 0.38, 2, 0.01), M.snow);
      snowTop.position.y = 0.955;
      g.add(snowTop);
      for (const x of [-0.2, 0.2])
        for (const z of [-0.232, 0.232]) {
          const w = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.14), M.window);
          w.position.set(x, 0.56, z);
          if (z < 0) w.rotation.y = Math.PI;
          g.add(w);
        }
      const lantern = glowSprite(0xff6a5a, 0.7, 0.9);
      lantern.position.set(-0.44, 0.62, 0);
      g.add(lantern);
    }
    addWheels(g, [-0.26, 0.26]);
    return g;
  }

  const cars = [
    { obj: locomotive(), len: 1.45 },
    { obj: wagon('presents'), len: 1.0 },
    { obj: wagon('tree'), len: 1.0 },
    { obj: wagon('caboose'), len: 1.0 },
  ];
  let offset = 0;
  for (const c of cars) {
    c.offset = offset / radius;
    offset += c.len;
    group.add(c.obj);
  }

  // steam puffs
  const puffs = [];
  const puffMat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xdfe6f0, transparent: true, opacity: 0, depthWrite: false });
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(puffMat.clone());
    s.userData = { life: 0, max: 1, vel: new THREE.Vector3() };
    group.add(s);
    puffs.push(s);
  }
  let puffTimer = 0;
  let puffIdx = 0;
  const tmp = new THREE.Vector3();
  function puff(strength = 1) {
    const s = puffs[puffIdx++ % puffs.length];
    cars[0].obj.localToWorld(tmp.copy(cars[0].obj.userData.chimney));
    group.worldToLocal(tmp);
    s.position.copy(tmp);
    s.userData.life = s.userData.max = 1.8 + Math.random() * 0.8;
    s.userData.vel.set((Math.random() - 0.5) * 0.15, 0.55 * strength, (Math.random() - 0.5) * 0.15);
  }

  // click targets that travel with each car
  const hitBoxes = cars.map((c) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(c.len, 1.1, 0.8), new THREE.MeshBasicMaterial({ visible: false }));
    b.position.y = 0.5;
    c.obj.add(b);
    return b;
  });

  let angle = 1.2;
  let speed = 0.085;
  let boost = 0;
  function update(dt) {
    angle += dt * (speed + boost);
    boost = Math.max(0, boost - dt * 0.05);
    for (const c of cars) {
      const a = angle - c.offset;
      c.obj.position.set(Math.cos(a) * radius, y0 + 0.06, Math.sin(a) * radius);
      c.obj.rotation.y = -(a + Math.PI / 2);
    }
    for (const w of wheels) w.rotation.z -= dt * (speed + boost) * radius / 0.13;
    puffTimer -= dt;
    if (puffTimer <= 0) {
      puffTimer = 0.55 + Math.random() * 0.3;
      puff();
    }
    for (const s of puffs) {
      const u = s.userData;
      if (u.life <= 0) {
        s.material.opacity = 0;
        continue;
      }
      u.life -= dt;
      const k = 1 - u.life / u.max;
      s.position.addScaledVector(u.vel, dt);
      s.scale.setScalar(0.25 + k * 1.1);
      s.material.opacity = Math.sin(Math.min(k, 1) * Math.PI) * 0.32;
    }
  }

  return {
    group,
    hitBoxes,
    update,
    whistle() {
      boost = 0.12;
      for (let i = 0; i < 4; i++) setTimeout(() => puff(1.6), i * 120);
    },
  };
}
