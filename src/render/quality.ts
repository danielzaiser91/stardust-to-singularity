import type { GameState } from '../core/state';

export interface QualityTier {
  name: 'low' | 'medium' | 'high';
  dustParticles: number;
  galaxyParticles: number;
  bloom: boolean;
  lensing: boolean;
  dpr: number;
}

export const TIERS: QualityTier[] = [
  { name: 'low', dustParticles: 6000, galaxyParticles: 15000, bloom: false, lensing: false, dpr: 1 },
  { name: 'medium', dustParticles: 25000, galaxyParticles: 60000, bloom: true, lensing: false, dpr: 1.25 },
  { name: 'high', dustParticles: 60000, galaxyParticles: 140000, bloom: true, lensing: true, dpr: 1.5 },
];

/** Software-Renderer (SwiftShader/llvmpipe) → immer Low, sonst kriecht alles */
export function sniffSoftwareGL(gl: WebGLRenderingContext | WebGL2RenderingContext): boolean {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return false;
    const r = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
    return /swiftshader|llvmpipe|software|basic render/i.test(r);
  } catch { return false; }
}

/** Auto-Detection: Kerne + grobe Mobile-Heuristik; Nutzer kann in Settings übersteuern */
export function detectTier(): QualityTier {
  const cores = navigator.hardwareConcurrency ?? 4;
  const mobile = /Android|iPhone|iPad|Mobi/i.test(navigator.userAgent);
  if (mobile && cores <= 4) return TIERS[0];
  if (mobile || cores <= 4) return TIERS[1];
  return TIERS[2];
}

export function activeTier(s: GameState, forceLow = false): QualityTier {
  if (s.settings.quality === 0) return forceLow ? TIERS[0] : detectTier();
  return TIERS[s.settings.quality - 1];
}
