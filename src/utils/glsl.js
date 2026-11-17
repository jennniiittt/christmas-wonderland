/** Shared GLSL helpers (value noise). Prefixed to avoid clashing with three.js chunks. */
export const NOISE_GLSL = /* glsl */ `
float cwHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float cwNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(cwHash(i + vec3(0.0, 0.0, 0.0)), cwHash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(cwHash(i + vec3(0.0, 1.0, 0.0)), cwHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(cwHash(i + vec3(0.0, 0.0, 1.0)), cwHash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(cwHash(i + vec3(0.0, 1.0, 1.0)), cwHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
`;
