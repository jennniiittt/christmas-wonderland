import * as THREE from 'three';

/**
 * A warm, candle-lit environment map baked once with PMREM. It gives the
 * metallic ornaments, ribbons and foil wrapping their soft golden reflections.
 */
export function createEnvironmentMap(renderer) {
  const scene = new THREE.Scene();

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(10, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {},
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `varying vec3 vP; void main(){
        float h = normalize(vP).y;
        vec3 top = vec3(0.012,0.02,0.05);
        vec3 hor = vec3(0.09,0.07,0.06);
        vec3 bot = vec3(0.16,0.17,0.2);
        vec3 c = h > 0. ? mix(hor, top, pow(h,0.6)) : mix(hor, bot, pow(-h,0.5));
        gl_FragColor = vec4(c,1.);
      }`,
    })
  );
  scene.add(dome);

  const addCard = (color, intensity, pos, w, h) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide })
    );
    m.position.copy(pos);
    m.lookAt(0, 0, 0);
    scene.add(m);
  };
  // warm "fairy light" panels, a cool moon window and a soft top light
  addCard(0xffb560, 6, new THREE.Vector3(6, 2, 5), 3, 2);
  addCard(0xffc77a, 5, new THREE.Vector3(-7, 1, 3), 2.5, 2.5);
  addCard(0xffa848, 4, new THREE.Vector3(-3, -1, -7), 4, 1.2);
  addCard(0xff9a40, 3.5, new THREE.Vector3(5, 3, -6), 1.5, 1.5);
  addCard(0xbcd4ff, 3, new THREE.Vector3(-4, 7, -3), 3, 2);
  addCard(0xfff1d8, 2.5, new THREE.Vector3(0, 9, 0), 5, 5);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.03);
  pmrem.dispose();
  scene.traverse((o) => {
    o.geometry?.dispose();
    o.material?.dispose();
  });
  return rt.texture;
}
