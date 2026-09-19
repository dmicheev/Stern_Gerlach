import { AG_MASS, MU_B } from './constants'
import { Pcg32 } from './rng'
import type { ScreenFrame } from './beams'
import type { SimulationConfig } from './types'

/**
 * Client-side quantum mode: analytic superposition of Gaussian wavepackets.
 *
 * The packet starts as a single Gaussian and splits at each apparatus into two
 * branches with weights cos²(θ_rel/2) / sin²(θ_rel/2) (θ_rel = angle between the
 * incoming spin axis and the apparatus axis). Branch centers follow Ehrenfest
 * trajectories in the full transverse plane: deflection along the apparatus
 * axis n(theta) = (-sin θ, cos θ), like the semiclassical kinematics. Each
 * branch carries a dispersive Gaussian envelope. A blocked port removes the
 * corresponding branch.
 *
 * Frames are evaluated lazily from the branch descriptors — only O(branches)
 * numbers are stored, so any time can be rendered cheaply.
 */

export interface QuantumBranch {
  /** amplitude weight (sums to <= 1 over alive branches) */
  weight: number
  /** final spin axis angle (rad) = axis of the last apparatus */
  spinTheta: number
  /** final spin sign relative to the LAST apparatus axis (+1/-1) */
  spinSign: number
  /** center positions in meters per sample, length = frameCount */
  cx: Float64Array
  cy: Float64Array
  cz: Float64Array
  /** envelope widths (meters) per sample */
  sx: Float64Array
  sy: Float64Array
  sz: Float64Array
}

export interface QuantumHeader {
  frameCount: number
  timePerFrame: number
  tTotal: number
  /** grid extents (meters) for rendering */
  xMin: number
  xMax: number
  zMin: number
  zMax: number
  cols: number
  rows: number
}

export interface QuantumResult {
  header: QuantumHeader
  branches: QuantumBranch[]
}

const FRAMES = 200
/** packet emanates from the slit at x = PACKET_X0 (m) */
const PACKET_X0 = 0.05

export function simulateQuantum(cfg: SimulationConfig): QuantumResult {
  const v = cfg.source.vMean
  const sigmaVx = cfg.source.vSigma
  const sigmaVz = cfg.source.divergence * v
  const sigmaVy = sigmaVz // transverse beam is round (aperture/divergence shared)
  const sigmaX0 = 0.01 // 10 cm packet along the beam (oven has no x-selection)
  const sigmaZ0 = Math.max(cfg.source.aperture * 0.5, 2e-4)
  const sigmaY0 = sigmaZ0

  const apps = [...cfg.apparatuses].sort((a, b) => a.xStart - b.xStart)
  const tTotal = (cfg.screenX + 0.06 - PACKET_X0) / v
  const dtFrame = tTotal / FRAMES

  // beam key of a packet branch: 'root' initially, then `${appId}:${up|down}`
  // axis angle in the Y-Z plane: n(theta) = (0, -sin, cos)
  const axisAngle = (deg: number) => (deg * Math.PI) / 180

  interface Live {
    weight: number
    theta: number // spin axis angle (rad), NaN = unpolarized
    sign: number // +1/-1 if polarized
    beam: string // beam this packet travels on
    tSplit: number // time this branch's kinematics started
    y0: number // center (y, z) at tSplit
    z0: number
    vy0: number // transverse velocity at tSplit
    vz0: number
    ay: number // transverse accel after tSplit (piecewise: magnet then 0)
    az: number
    tExit: number // magnet exit time
  }

  const accelOf = (gradient: number) => (MU_B * gradient) / AG_MASS

  /** branch center at time t: accel inside the magnet, drift after exit */
  const posAt = (b: Live, t: number): { y: number; z: number } => {
    const dt = t - b.tSplit
    const ta = Math.max(0, Math.min(t, b.tExit) - b.tSplit)
    const drift = t > b.tExit ? (t - b.tExit) * Math.max(0, b.tExit - b.tSplit) : 0
    return {
      y: b.y0 + b.vy0 * dt + 0.5 * b.ay * ta * ta + b.ay * drift,
      z: b.z0 + b.vz0 * dt + 0.5 * b.az * ta * ta + b.az * drift,
    }
  }
  const velAt = (b: Live, t: number): { vy: number; vz: number } => {
    const ta = Math.max(0, Math.min(t, b.tExit) - b.tSplit)
    return { vy: b.vy0 + b.ay * ta, vz: b.vz0 + b.az * ta }
  }

  // initial packet: unpolarized beam modeled as two branches (up/down along
  // the first apparatus axis) with 50/50 — they coincide spatially until split
  let live: Live[] = [
    {
      weight: 1,
      theta: NaN,
      sign: 0,
      beam: 'root',
      tSplit: 0,
      y0: 0,
      z0: 0,
      vy0: 0,
      vz0: 0,
      ay: 0,
      az: 0,
      tExit: 0,
    },
  ]

  for (const app of apps) {
    const thetaApp = axisAngle(app.angleDeg)
    const ny = -Math.sin(thetaApp)
    const nz = Math.cos(thetaApp)
    const tEnt = (app.xStart - PACKET_X0) / v
    const tExit = (app.xStart + app.length - PACKET_X0) / v
    const a = accelOf(app.gradient)
    const next: Live[] = []
    for (const b of live) {
      // only packets traveling on this apparatus's beam are split by it
      if (b.beam !== app.attachTo) {
        next.push(b)
        continue
      }
      // relative angle between incoming spin and apparatus axis
      let pUp: number
      if (Number.isNaN(b.theta)) {
        pUp = 0.5
      } else {
        const dTheta = b.theta - thetaApp
        pUp = Math.cos(dTheta / 2) ** 2
      }
      const pDown = 1 - pUp
      // entry state of the incoming packet at this magnet
      const pE = posAt(b, tEnt)
      const vE = velAt(b, tEnt)
      for (const sign of [1, -1] as const) {
        const w = b.weight * (sign > 0 ? pUp : pDown)
        if (w < 1e-4) continue
        if (app.blockedPort === 'up' && sign > 0) continue
        if (app.blockedPort === 'down' && sign < 0) continue
        next.push({
          weight: w,
          theta: thetaApp,
          sign,
          beam: `${app.id}:${sign > 0 ? 'up' : 'down'}`,
          tSplit: tEnt,
          y0: pE.y,
          z0: pE.z,
          vy0: vE.vy,
          vz0: vE.vz,
          ay: sign * a * ny,
          az: sign * a * nz,
          tExit,
        })
      }
    }
    live = next
  }

  // sample branch paths
  const zSpread = 0.045
  const zMax = zSpread
  const zMin = -zSpread
  const branches: QuantumBranch[] = live.map((b) => {
    const cx = new Float64Array(FRAMES)
    const cy = new Float64Array(FRAMES)
    const cz = new Float64Array(FRAMES)
    const sx = new Float64Array(FRAMES)
    const sy = new Float64Array(FRAMES)
    const sz = new Float64Array(FRAMES)
    for (let f = 0; f < FRAMES; f++) {
      const t = f * dtFrame
      // x(t): uniform motion from the slit
      cx[f] = PACKET_X0 + v * t
      // transverse center: piecewise accel inside magnet, drift outside
      const p = posAt(b, t)
      cy[f] = p.y
      cz[f] = p.z
      // dispersive widths (momentum spread dominated for Ag; free-particle form)
      sx[f] = Math.sqrt(sigmaX0 * sigmaX0 + (sigmaVx * t) ** 2)
      sy[f] = Math.sqrt(sigmaY0 * sigmaY0 + (sigmaVy * t) ** 2)
      sz[f] = Math.sqrt(sigmaZ0 * sigmaZ0 + (sigmaVz * t) ** 2)
    }
    return { weight: b.weight, spinTheta: b.theta, spinSign: b.sign, cx, cy, cz, sx, sy, sz }
  })

  return {
    header: {
      frameCount: FRAMES,
      timePerFrame: dtFrame,
      tTotal,
      xMin: 0,
      xMax: cfg.screenX + 0.05,
      zMin,
      zMax,
      cols: 192,
      rows: 128,
    },
    branches,
  }
}

/** Evaluate normalized rho(x, z, t) and spin asymmetry at time t (SI units). */
export function evalRho(
  q: QuantumResult,
  x: number,
  z: number,
  t: number,
): { rho: number; asym: number } {
  const { branches, header } = q
  const fExact = t / header.timePerFrame
  const f = Math.min(header.frameCount - 1.001, Math.max(0, fExact))
  const i0 = Math.floor(f)
  const frac = f - i0
  let rho = 0
  let up = 0
  let down = 0
  for (const b of branches) {
    const cx = b.cx[i0] + (b.cx[i0 + 1] - b.cx[i0]) * frac
    const cz = b.cz[i0] + (b.cz[i0 + 1] - b.cz[i0]) * frac
    const sx = b.sx[i0] + (b.sx[i0 + 1] - b.sx[i0]) * frac
    const sz = b.sz[i0] + (b.sz[i0 + 1] - b.sz[i0]) * frac
    const gx = Math.exp(-((x - cx) ** 2) / (2 * sx * sx))
    const gz = Math.exp(-((z - cz) ** 2) / (2 * sz * sz))
    const v = (b.weight * gx * gz) / (2 * Math.PI * sx * sz)
    rho += v
    if (b.spinSign > 0) up += v
    else if (b.spinSign < 0) down += v
  }
  const asym = up + down > 1e-12 ? (up - down) / (up + down) : 0
  return { rho, asym }
}

/** Marginal z-profile at a given x (for the detector histogram). */
export function evalProfile(q: QuantumResult, x: number, t: number, z: number): number {
  const { branches, header } = q
  const f = Math.min(header.frameCount - 1.001, Math.max(0, t / header.timePerFrame))
  const i0 = Math.floor(f)
  const frac = f - i0
  let rho = 0
  for (const b of branches) {
    const cx = b.cx[i0] + (b.cx[i0 + 1] - b.cx[i0]) * frac
    const cz = b.cz[i0] + (b.cz[i0 + 1] - b.cz[i0]) * frac
    const sx = b.sx[i0] + (b.sx[i0 + 1] - b.sx[i0]) * frac
    const sz = b.sz[i0] + (b.sz[i0 + 1] - b.sz[i0]) * frac
    const gx = Math.exp(-((x - cx) ** 2) / (2 * sx * sx))
    const gz = Math.exp(-((z - cz) ** 2) / (2 * sz * sz))
    rho += (b.weight * gx * gz) / (2 * Math.PI * sx * sz)
  }
  return rho
}

/**
 * Marginal profile along the screen-frame axis s (marginalized over the
 * transverse axis t): for each branch the (s, t) covariance is the rotated
 * diag(sy², sz²), so the s-marginal is Gaussian with variance (ny·sy)² + (nz·sz)².
 */
export function evalAxisProfile(
  q: QuantumResult,
  x: number,
  t: number,
  f: ScreenFrame,
  s: number,
): number {
  const { branches, header } = q
  const fr = Math.min(header.frameCount - 1.001, Math.max(0, t / header.timePerFrame))
  const i0 = Math.floor(fr)
  const frac = fr - i0
  let rho = 0
  for (const b of branches) {
    const cx = b.cx[i0] + (b.cx[i0 + 1] - b.cx[i0]) * frac
    const sx = b.sx[i0] + (b.sx[i0 + 1] - b.sx[i0]) * frac
    const cy = b.cy[i0] + (b.cy[i0 + 1] - b.cy[i0]) * frac
    const sy = b.sy[i0] + (b.sy[i0 + 1] - b.sy[i0]) * frac
    const cz = b.cz[i0] + (b.cz[i0 + 1] - b.cz[i0]) * frac
    const sz = b.sz[i0] + (b.sz[i0 + 1] - b.sz[i0]) * frac
    const sC = (cy - f.cy) * f.ny + (cz - f.cz) * f.nz
    const sig = Math.hypot(f.ny * sy, f.nz * sz)
    const gx = Math.exp(-((x - cx) ** 2) / (2 * sx * sx))
    const gs = Math.exp(-((s - sC) ** 2) / (2 * sig * sig))
    rho += (b.weight * gx * gs) / (2 * Math.PI * sx * sig)
  }
  return rho
}

/** max |center| + 4σ extent of the branches projected on the screen-frame axis (meters) */
export function maxAxisExtent(q: QuantumResult, f: ScreenFrame): number {
  const fr = q.header.frameCount - 1
  let m = 0
  for (const b of q.branches) {
    const s = (b.cy[fr] - f.cy) * f.ny + (b.cz[fr] - f.cz) * f.nz
    const sig = Math.hypot(f.ny * b.sy[fr], f.nz * b.sz[fr])
    const ext = Math.abs(s) + 4 * sig
    if (ext > m) m = ext
  }
  return m
}

// ------------------------------------------------- screen hit sampling ---

export interface ScreenHits {
  /** arrival times (sorted) */
  times: Float64Array
  ys: Float64Array
  zs: Float64Array
  /** final spin axis angle (rad, NaN = unmeasured) per hit */
  thetas: Float64Array
  signs: Int8Array
}

interface BranchState {
  w: number
  cx: number
  sx: number
  cy: number
  sy: number
  cz: number
  sz: number
}

function branchStatesAt(q: QuantumResult, t: number): BranchState[] {
  const { branches, header } = q
  const f = Math.min(header.frameCount - 1.001, Math.max(0, t / header.timePerFrame))
  const i0 = Math.floor(f)
  const frac = f - i0
  return branches.map((b) => ({
    w: b.weight,
    cx: b.cx[i0] + (b.cx[i0 + 1] - b.cx[i0]) * frac,
    sx: b.sx[i0] + (b.sx[i0 + 1] - b.sx[i0]) * frac,
    cy: b.cy[i0] + (b.cy[i0 + 1] - b.cy[i0]) * frac,
    sy: b.sy[i0] + (b.sy[i0 + 1] - b.sy[i0]) * frac,
    cz: b.cz[i0] + (b.cz[i0 + 1] - b.cz[i0]) * frac,
    sz: b.sz[i0] + (b.sz[i0 + 1] - b.sz[i0]) * frac,
  }))
}

/**
 * Monte-Carlo detection of the wavepacket on the screen: arrival times are
 * drawn from the flux through the screen column, transverse positions from
 * the branch gaussians. Deterministic for a given seed.
 */
export function sampleScreenHits(
  q: QuantumResult,
  screenX: number,
  count: number,
  seed: number,
): ScreenHits {
  const rng = new Pcg32(seed >>> 0, 777n)
  const { header } = q
  const flux = (t: number) => {
    let s = 0
    for (const b of branchStatesAt(q, t)) {
      const d = (screenX - b.cx) / b.sx
      s += (b.w * Math.exp(-d * d / 2)) / (Math.sqrt(2 * Math.PI) * b.sx)
    }
    return s
  }
  // arrival-time CDF on a grid
  const M = 512
  const ts = new Float64Array(M)
  const cdf = new Float64Array(M)
  for (let j = 1; j < M; j++) {
    const tPrev = ts[j - 1]
    const t = (header.tTotal * j) / (M - 1)
    ts[j] = t
    cdf[j] = cdf[j - 1] + ((flux(tPrev) + flux(t)) / 2) * (t - tPrev)
  }
  const total = cdf[M - 1] || 1e-12

  const times = new Float64Array(count)
  const ys = new Float64Array(count)
  const zs = new Float64Array(count)
  const thetas = new Float64Array(count)
  const signs = new Int8Array(count)
  for (let k = 0; k < count; k++) {
    // invert the CDF
    const u = rng.nextFloat() * total
    let j = 1
    while (j < M - 1 && cdf[j] < u) j++
    const f = (u - cdf[j - 1]) / (cdf[j] - cdf[j - 1] || 1)
    const t = ts[j - 1] + f * (ts[j] - ts[j - 1])
    // pick a branch proportionally to its flux share
    const states = branchStatesAt(q, t)
    let F = 0
    for (const b of states) {
      const d = (screenX - b.cx) / b.sx
      F += (b.w * Math.exp(-d * d / 2)) / (Math.sqrt(2 * Math.PI) * b.sx)
    }
    let r = rng.nextFloat() * (F || 1e-12)
    let picked = states[0]
    for (const b of states) {
      const d = (screenX - b.cx) / b.sx
      const share = (b.w * Math.exp(-d * d / 2)) / (Math.sqrt(2 * Math.PI) * b.sx)
      if (r < share) {
        picked = b
        break
      }
      r -= share
    }
    times[k] = t
    zs[k] = picked.cz + picked.sz * rng.normal()
    ys[k] = picked.cy + picked.sy * rng.normal()
    const branch = q.branches[states.indexOf(picked)]
    thetas[k] = branch.spinTheta
    signs[k] = branch.spinSign
  }
  // sort by arrival time
  const order = Array.from({ length: count }, (_, i) => i).sort((a, b) => times[a] - times[b])
  const pick = (arr: Float64Array) => {
    const out = new Float64Array(count)
    for (let i = 0; i < count; i++) out[i] = arr[order[i]]
    return out
  }
  const sOrder = new Int8Array(count)
  for (let i = 0; i < count; i++) sOrder[i] = signs[order[i]]
  return { times: pick(times), ys: pick(ys), zs: pick(zs), thetas: pick(thetas), signs: sOrder }
}
