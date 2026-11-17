/**
 * Shared, mutable world state. `timeScale` lets cinematic moments (opening a
 * present, the finale) gently slow every ambient animation in the scene.
 */
export const world = {
  time: 0, // scaled world time (seconds)
  realTime: 0, // unscaled time
  timeScale: 1,
  tier: 'high',
  settings: null,
  reducedMotion: false,
  coarsePointer: false,
  /** Shared shader uniforms */
  uniforms: {
    uTime: { value: 0 },
    uPixelRatio: { value: 1 },
    uPointScale: { value: 600 },
  },
};
