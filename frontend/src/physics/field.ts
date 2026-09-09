import type { Apparatus } from './types'

/**
 * Composite magnetic field of the Stern-Gerlach cascade.
 *
 * Beam axis: X. World Z is vertical. Each apparatus is rotated by theta around
 * the beam axis; its local field (near axis, div-free & curl-free to 1st order):
 *   B_local = envelope(x_l) * zenv(r_perp) * (0, -G*y_l, B0 + G*z_l)
 * Local axis z_l maps to world n(theta) = (0, -sin(theta), cos(theta)).
 */
export interface AppCache {
  cos: number
  sin: number
  ny: number
  nz: number
  xIn: number
  xOut: number
  xEnd: number // xOut + blocker drift, where absorption is registered
  G: number
  B0: number
  gap: number
  fr: number
  blocked: 'up' | 'down' | null
  angleRad: number
  /** transverse magnet center (world Y-Z, meters) — the beam it sits on */
  cy: number
  cz: number
  id: string
}

export const FRINGE = 0.012 // m, fringe length scale

export function buildCache(apps: Apparatus[], centers?: Map<string, { y: number; z: number }>): AppCache[] {
  return apps.map((a) => {
    const t = (a.angleDeg * Math.PI) / 180
    const c = centers?.get(a.id) ?? { y: 0, z: 0 }
    return {
      cos: Math.cos(t),
      sin: Math.sin(t),
      ny: -Math.sin(t),
      nz: Math.cos(t),
      xIn: a.xStart,
      xOut: a.xStart + a.length,
      xEnd: a.xStart + a.length + 0.02,
      G: a.gradient,
      B0: a.b0,
      gap: a.gap,
      fr: FRINGE,
      blocked: a.blockedPort,
      angleRad: t,
      cy: c.y,
      cz: c.z,
      id: a.id,
    }
  })
}

/** smooth envelope along beam: 0 -> 1 -> 0 with tanh fringes */
export function envelope(x: number, a: AppCache): number {
  const u = (x - a.xIn) / a.fr
  const v = (x - a.xOut) / a.fr
  return 0.5 * (Math.tanh(u) - Math.tanh(v))
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** transverse window: 1 inside gap, smoothly 0 outside */
export function gapWindow(rPerp: number, gap: number): number {
  return 1 - smoothstep(gap, gap * 1.6, rPerp)
}

/** world-frame field components (for visualization) */
export function fieldAt(caches: AppCache[], x: number, y: number, z: number, out: [number, number, number]): void {
  out[0] = 0
  out[1] = 0
  out[2] = 0
  for (const a of caches) {
    if (x < a.xIn - 4 * a.fr || x > a.xOut + 4 * a.fr) continue
    const yl = a.cos * (y - a.cy) + a.sin * (z - a.cz)
    const zl = -a.sin * (y - a.cy) + a.cos * (z - a.cz)
    const e = envelope(x, a) * gapWindow(Math.hypot(yl, zl), a.gap)
    if (e === 0) continue
    const Byl = -a.G * yl
    const Bzl = a.B0 + a.G * zl
    // world = Rx(theta) * local
    out[1] += a.cos * Byl - a.sin * Bzl
    out[2] += a.sin * Byl + a.cos * Bzl
  }
}

/**
 * Classical force F = grad(mu.B) with constant mu_hat.
 * Gradient of the gap window is neglected (small near axis — documented approximation).
 */
export function forceClassical(
  caches: AppCache[],
  x: number,
  y: number,
  z: number,
  my: number,
  mz: number,
  muB: number,
  out: Float64Array,
): void {
  out[0] = 0
  out[1] = 0
  out[2] = 0
  for (const a of caches) {
    if (x < a.xIn - 4 * a.fr || x > a.xOut + 4 * a.fr) continue
    const yl = a.cos * (y - a.cy) + a.sin * (z - a.cz)
    const zl = -a.sin * (y - a.cy) + a.cos * (z - a.cz)
    const gw = gapWindow(Math.hypot(yl, zl), a.gap)
    if (gw === 0) continue
    // local mu_hat components (mu_x local gives no force to 1st order)
    const muy_l = a.cos * my + a.sin * mz
    const muz_l = -a.sin * my + a.cos * mz
    const u = (x - a.xIn) / a.fr
    const v = (x - a.xOut) / a.fr
    const sech2 = (t: number) => {
      const c = Math.cosh(t)
      return 1 / (c * c)
    }
    const dEdx = (0.5 / a.fr) * (sech2(u) - sech2(v))
    const e = envelope(x, a)
    const fL_y = e * gw * (-a.G * muy_l)
    const fL_z = e * gw * a.G * muz_l
    const muDotB = -a.G * muy_l * yl + muz_l * (a.B0 + a.G * zl)
    const fL_x = gw * dEdx * muDotB
    out[0] += muB * fL_x
    out[1] += muB * (a.cos * fL_y - a.sin * fL_z)
    out[2] += muB * (a.sin * fL_y + a.cos * fL_z)
  }
}
