/** Device capability detection + quality tiers. Override with ?quality=high|medium|low */
export const TIERS = {
  high: { pixelRatio: 1.75, bloom: true, msaa: 4, fronds: 4200, lights: 950, snow: 4200, motes: 260, baubles: 170, beads: 1 },
  medium: { pixelRatio: 1.35, bloom: true, msaa: 2, fronds: 3100, lights: 760, snow: 2800, motes: 180, baubles: 140, beads: 0.8 },
  low: { pixelRatio: 1, bloom: false, msaa: 0, fronds: 2100, lights: 580, snow: 1700, motes: 110, baubles: 110, beads: 0.6 },
};

export function detectCapabilities() {
  const params = new URLSearchParams(location.search);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;
  if (params.has('fallback')) return { webgl: false, reducedMotion, coarse };

  let gl = null;
  const canvas = document.createElement('canvas');
  try {
    gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  } catch {
    gl = null;
  }
  if (!gl) return { webgl: false, reducedMotion, coarse };

  const webgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  let rendererName = '';
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  if (dbg) rendererName = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '');
  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  gl.getExtension('WEBGL_lose_context')?.loseContext();

  const small = Math.min(screen.width, screen.height) < 600;
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 8;

  let tier = 'high';
  if (coarse || small || cores < 4 || mem <= 4) tier = 'medium';
  if (/swiftshader|llvmpipe|software|basic render|mesa offscreen/i.test(rendererName) || !webgl2 || maxTex < 4096) tier = 'low';
  const forced = params.get('quality');
  if (forced && TIERS[forced]) tier = forced;

  return { webgl: true, webgl2, tier, coarse, reducedMotion, rendererName };
}
