import { AG_MASS, HBAR, MU_B } from './constants'
import { buildBeamTree } from './beams'
import { Pcg32 } from './rng'
import type { ScreenFrame } from './beams'
import type { Apparatus, SimulationConfig } from './types'
import { kindOf } from './types'

/**
 * Client-side quantum mode: coherent Gaussian-branch model ("Pauli-inspired"
 * WKB — NOT a numerical solution of the Pauli equation).
 *
 * Each branch carries a COMPLEX amplitude: modulus = weight, phase = classical
 * action S = ∫[½m·v⊥² − U]dt along its Ehrenfest trajectory, with the
 * spin-dependent potential U = −s·μ_B·(B₀+G·q) inside magnets — the Larmor
 * phase of B₀ is therefore included automatically. Kinematics is a list of
 * segments with piecewise-constant acceleration; position, velocity and action
 * have closed forms per segment.
 *
 * Spin states are full spinors ±n̂(θ) in the σ_z basis; analyzer projections use
 * complex matrix elements ⟨χ_±|χ⟩ (fixing the sign of down-branch probabilities).
 *
 * Coherence bookkeeping: branches sharing a cohId interfere wherever their
 * packets overlap. A kind='magnet' splits a pure branch coherently (children
 * inherit cohId); a kind='analyzer' registers which-path (ports get fresh
 * cohIds). The unpolarized oven is a mixed state: its first split is
 * incoherent (½/½) — the previous behavior. Port probabilities with
 * interference emerge in the continuous density through the pairwise complex
 * Gaussian overlaps (including the momentum-tilt factor e^{imΔv·x/ħ}); for
 * separated packets the cross terms vanish and the model reduces to the
 * classical mixture.
 *
 * kind='recombiner' merges the `${X}:up`/`${X}:down` pair of its parent
 * splitter into `${X}:merged` with a two-piece gradient profile (−G, then a
 * computed +G₂) that returns the pair's relative coordinate (position and
 * velocity) exactly to zero — no measurement, spinors and cohIds survive.
 * phaseShiftDeg adds a controllable e^{iφ} to the up-arm (phase plate).
 *
 * Interference fringes between split branches are nanometer-scale for silver
 * (λ_f = h/mΔv) and average out at display resolution — that hierarchy is a
 * real physical fact. After exact recombination the relative momentum is zero,
 * so the observable is the contrast/port-count oscillation vs the phase knob.
 *
 * Branch envelopes remain free-particle dispersive Gaussians:
 *   σ²(t) = σ0² + (σv·t)² + (ħt/2mσ0)²  — classical ensemble spread dominates.
 *
 * Frames are evaluated lazily from branch descriptors — only O(branches·frames)
 * numbers are stored.
 */

export interface QuantumBranch {
  /** |amplitude|² (kept for compatibility; the complex amplitude is canonical) */
  weight: number
  /** complex amplitude at the screen (constant after the last split) */
  aRe: number
  aIm: number
  /** coherence-group id: branches with equal cohId interfere where they overlap */
  cohId: string
  /** final spin axis angle (rad) = axis of the last splitting apparatus; NaN = unpolarized */
  spinTheta: number
  /** final spin sign relative to the LAST splitting axis (+1/-1) */
  spinSign: number
  /** center positions in meters per sample, length = frameCount */
  cx: Float64Array
  cy: Float64Array
  cz: Float64Array
  /** envelope widths (meters) per sample */
  sx: Float64Array
  sy: Float64Array
  sz: Float64Array
  /** transverse velocities (m/s) per sample — momentum tilt of the packet phase */
  vy: Float64Array
  vz: Float64Array
  /** WKB action phase S/ħ (rad) per sample */
  phase: Float64Array
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

export interface InterferometerPhase {
  apparatusId: string
  /** relative phase (up − down) of the first coherent merged pair, rad mod 2π */
  deltaPhase: number
}

export interface QuantumResult {
  header: QuantumHeader
  branches: QuantumBranch[]
  /** total probability mass dropped by the branch-weight cutoff (0 for shallow cascades) */
  discardedWeight: number
  interferometerPhases: InterferometerPhase[]
}

const FRAMES = 200
/** packet emanates from the slit at x = PACKET_X0 (m) */
const PACKET_X0 = 0.05
/** branches lighter than this are pruned; the lost mass is reported in discardedWeight */
const MIN_BRANCH_WEIGHT = 1e-10

/** variance of a free dispersive Gaussian: σ0² + (σv·t)² + (ħt/2mσ0)² */
function widthAt(sigma0: number, sigmaV: number, t: number): number {
  const vQuantum = HBAR / (2 * AG_MASS * sigma0) // effective velocity spread from quantum dispersion
  return Math.sqrt(sigma0 * sigma0 + (sigmaV * t) ** 2 + (vQuantum * t) ** 2)
}

// ----------------------------------------------------------------- spinors ---

/** spinor of the eigenstate σ·n̂(θ) = sign in the {|↑z⟩, |↓z⟩} basis: [re0, im0, re1, im1] */
export function spinor(theta: number, sign: number): [number, number, number, number] {
  const c = Math.cos(theta / 2)
  const s = Math.sin(theta / 2)
  // +: (cos(θ/2), −i·sin(θ/2));  −: (i·sin(θ/2), −cos(θ/2))
  return sign >= 0 ? [c, 0, 0, -s] : [0, s, -c, 0]
}

/** ⟨χ_A|χ_B⟩ for eigenstates (θA, sA) and (θB, sB) */
export function spinOverlap(
  thetaA: number,
  sA: number,
  thetaB: number,
  sB: number,
): { re: number; im: number } {
  const a = spinor(thetaA, sA)
  const b = spinor(thetaB, sB)
  // Σ_components conj(a_c)·b_c
  return {
    re: a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3],
    im: a[0] * b[1] - a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  }
}

// --------------------------------------------------------------- segments ---

interface Pot {
  b0: number
  /** signed gradient of this piece (T/m) */
  g: number
  ny: number
  nz: number
  cy: number
  cz: number
}

/** piecewise-constant acceleration piece with the potential that generates it */
interface Seg {
  t0: number
  y0: number
  z0: number
  vy0: number
  vz0: number
  ay: number
  az: number
  /** spin eigenvalue on the potential axis (±1 in analyzers/magnets) */
  sLocal: number
  pot: Pot | null
  /** cumulative action S(t0) (J·s) */
  s0: number
}

interface Live {
  aRe: number
  aIm: number
  /** spin axis angle (rad), NaN = unpolarized mixture (root only) */
  theta: number
  sign: number
  cohId: string
  beam: string
  segs: Seg[]
}

function segState(s: Seg, t: number) {
  const dt = t - s.t0
  return {
    y: s.y0 + s.vy0 * dt + 0.5 * s.ay * dt * dt,
    z: s.z0 + s.vz0 * dt + 0.5 * s.az * dt * dt,
    vy: s.vy0 + s.ay * dt,
    vz: s.vz0 + s.az * dt,
  }
}

/** closed-form action increment inside one segment */
function segAction(s: Seg, t: number): number {
  const dt = Math.max(0, t - s.t0)
  const v2 = s.vy0 * s.vy0 + s.vz0 * s.vz0
  const va = s.vy0 * s.ay + s.vz0 * s.az
  const a2 = s.ay * s.ay + s.az * s.az
  let inc = 0.5 * AG_MASS * (v2 * dt + va * dt * dt + (a2 * dt * dt * dt) / 3)
  if (s.pot) {
    const q0 = (s.y0 - s.pot.cy) * s.pot.ny + (s.z0 - s.pot.cz) * s.pot.nz
    const qv = s.vy0 * s.pot.ny + s.vz0 * s.pot.nz
    const qa = s.ay * s.pot.ny + s.az * s.pot.nz
    const qint = q0 * dt + (qv * dt * dt) / 2 + (qa * dt * dt * dt) / 6
    inc += s.sLocal * MU_B * (s.pot.b0 * dt + s.pot.g * qint)
  }
  return s.s0 + inc
}

function activeSeg(b: Live, t: number): Seg {
  const segs = b.segs
  let k = 0
  for (let i = segs.length - 1; i >= 0; i--) {
    if (segs[i].t0 <= t) {
      k = i
      break
    }
  }
  return segs[k]
}

const posAt = (b: Live, t: number) => segState(activeSeg(b, t), t)
const velAt = (b: Live, t: number) => segState(activeSeg(b, t), t)
const actionAt = (b: Live, t: number) => segAction(activeSeg(b, t), t)

/** append a force-free segment starting at time t (closes the previous piece) */
function pushDrift(segs: Seg[], t: number) {
  const prev = segs[segs.length - 1]
  const st = segState(prev, t)
  segs.push({
    t0: t,
    y0: st.y,
    z0: st.z,
    vy0: st.vy,
    vz0: st.vz,
    ay: 0,
    az: 0,
    sLocal: 0,
    pot: null,
    s0: segAction(prev, t),
  })
}

// -------------------------------------------------------------- simulation ---

export function simulateQuantum(cfg: SimulationConfig): QuantumResult {
  const v = cfg.source.vMean
  const sigmaVx = cfg.source.vSigma
  const sigmaVz = cfg.source.divergence * v
  const sigmaVy = sigmaVz // transverse beam is round (aperture/divergence shared)
  const sigmaX0 = 0.01 // 1 cm packet along the beam (oven has no x-selection)
  const sigmaZ0 = Math.max(cfg.source.aperture * 0.5, 2e-4)
  const sigmaY0 = sigmaZ0

  const tree = buildBeamTree(cfg.apparatuses, v)
  const centers = new Map<string, { y: number; z: number }>()
  for (const n of tree.nodes) centers.set(n.app.id, { y: n.cy, z: n.cz })

  const apps = [...cfg.apparatuses].sort((a, b) => a.xStart - b.xStart)
  const tTotal = (cfg.screenX + 0.06 - PACKET_X0) / v
  const dtFrame = tTotal / FRAMES

  const axisAngle = (deg: number) => (deg * Math.PI) / 180
  const accelOf = (gradient: number) => (MU_B * gradient) / AG_MASS

  let discardedWeight = 0
  const interferometerPhases: InterferometerPhase[] = []

  // unpolarized oven: a single MIXED branch (incoherent components upon split)
  const rootSeg: Seg = {
    t0: 0,
    y0: 0,
    z0: 0,
    vy0: 0,
    vz0: 0,
    ay: 0,
    az: 0,
    sLocal: 0,
    pot: null,
    s0: 0,
  }
  let live: Live[] = [
    { aRe: 1, aIm: 0, theta: NaN, sign: 0, cohId: 'root-mixed', beam: 'root', segs: [rootSeg] },
  ]

  for (const app of apps) {
    if (kindOf(app) === 'recombiner') {
      live = applyRecombiner(app, live, v, axisAngle, accelOf, PACKET_X0, interferometerPhases)
      continue
    }
    const thetaApp = axisAngle(app.angleDeg)
    const ny = -Math.sin(thetaApp)
    const nz = Math.cos(thetaApp)
    const tEnt = (app.xStart - PACKET_X0) / v
    const tExit = tEnt + app.length / v
    const aMag = accelOf(app.gradient)
    const center = centers.get(app.id) ?? { y: 0, z: 0 }
    const pot: Pot = { b0: app.b0, g: app.gradient, ny, nz, cy: center.y, cz: center.z }
    const coherentKind = kindOf(app) === 'magnet'

    const next: Live[] = []
    for (const b of live) {
      // only packets traveling on this apparatus's beam are split by it
      if (b.beam !== app.attachTo) {
        next.push(b)
        continue
      }
      const pE = posAt(b, tEnt)
      const vE = velAt(b, tEnt)
      const s0E = actionAt(b, tEnt)
      // a coherent magnet keeps pure parents' superposition; mixed parents and
      // measuring analyzers register which-path (fresh incoherent ids per port)
      const parentPure = !Number.isNaN(b.theta)
      const coherent = coherentKind && parentPure
      for (const s of [1, -1] as const) {
        // which-path registration: all children of one coherence group in one
        // port stay mutually coherent (indistinguishable), different ports
        // and different groups decorrelate; a coherent magnet's children keep
        // the parent's id (no which-path)
        const cohId = coherent
          ? b.cohId
          : `${b.cohId}@${app.id}:${s > 0 ? 'up' : 'down'}`
        const proj = parentPure
          ? spinOverlap(thetaApp, s, b.theta, b.sign)
          : { re: Math.SQRT1_2, im: 0 } // mixed input: unpolarized ½/½
        const aRe = b.aRe * proj.re - b.aIm * proj.im
        const aIm = b.aIm * proj.re + b.aRe * proj.im
        // blocked ports remove the branch entirely (projection, not a loss)
        if (app.blockedPort === 'up' && s > 0) continue
        if (app.blockedPort === 'down' && s < 0) continue
        const w2 = aRe * aRe + aIm * aIm
        if (w2 < MIN_BRANCH_WEIGHT) {
          discardedWeight += w2
          continue
        }
        const am = s * aMag
        const segs = [...b.segs]
        segs.push({
          t0: tEnt,
          y0: pE.y,
          z0: pE.z,
          vy0: vE.vy,
          vz0: vE.vz,
          ay: am * ny,
          az: am * nz,
          sLocal: s,
          pot,
          s0: s0E,
        })
        pushDrift(segs, tExit)
        next.push({
          aRe,
          aIm,
          theta: thetaApp,
          sign: s,
          cohId,
          beam: `${app.id}:${s > 0 ? 'up' : 'down'}`,
          segs,
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
    const vy = new Float64Array(FRAMES)
    const vz = new Float64Array(FRAMES)
    const phase = new Float64Array(FRAMES)
    let k = 0
    for (let f = 0; f < FRAMES; f++) {
      const t = f * dtFrame
      while (k + 1 < b.segs.length && b.segs[k + 1].t0 <= t) k++
      const seg = b.segs[k]
      const st = segState(seg, t)
      cx[f] = PACKET_X0 + v * t
      cy[f] = st.y
      cz[f] = st.z
      vy[f] = st.vy
      vz[f] = st.vz
      sx[f] = widthAt(sigmaX0, sigmaVx, t)
      sy[f] = widthAt(sigmaY0, sigmaVy, t)
      sz[f] = widthAt(sigmaZ0, sigmaVz, t)
      phase[f] = segAction(seg, t) / HBAR
    }
    const w2 = b.aRe * b.aRe + b.aIm * b.aIm
    return {
      weight: w2,
      aRe: b.aRe,
      aIm: b.aIm,
      cohId: b.cohId,
      spinTheta: b.theta,
      spinSign: b.sign,
      cx,
      cy,
      cz,
      sx,
      sy,
      sz,
      vy,
      vz,
      phase,
    }
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
    discardedWeight,
    interferometerPhases,
  }
}

/**
 * Recombiner: merge the `${X}:up` + `${X}:down` beams of the parent splitter.
 * Two-piece profile on the recombiner axis: piece 1 pushes the pair together
 * with reversed gradient −G for t₁, piece 2 (gradient +G₂, G₂ computed) brakes
 * the relative motion so that both separation and relative velocity are zero
 * at the exit — exact for a symmetric pair. No measurement: spinors, amplitudes
 * and cohIds survive; the up-arm gets the extra phase plate phaseShiftDeg.
 */
function applyRecombiner(
  app: Apparatus,
  live: Live[],
  v: number,
  axisAngle: (deg: number) => number,
  accelOf: (g: number) => number,
  packetX0: number,
  out: InterferometerPhase[],
): Live[] {
  const m = /^(.*):(up|down)$/.exec(app.attachTo)
  if (!m) return live // on the root beam — nothing to merge
  const X = m[1]
  const upBeam = `${X}:up`
  const downBeam = `${X}:down`
  const thetaR = axisAngle(app.angleDeg)
  const nRy = -Math.sin(thetaR)
  const nRz = Math.cos(thetaR)
  const tR = (app.xStart - packetX0) / v
  const T = app.length / v
  const aG = accelOf(app.gradient)
  const phiExtra = (((app.phaseShiftDeg ?? 0) * Math.PI) / 180) * HBAR

  const onPairBeams = (b: Live) => b.beam === upBeam || b.beam === downBeam
  const membersAll = live.filter(onPairBeams)
  if (membersAll.length === 0) return live
  // the blocker plate absorbs one arm entirely (projection, not a loss)
  const absorbed = (b: Live) =>
    (app.blockedPort === 'up' && b.beam === upBeam) ||
    (app.blockedPort === 'down' && b.beam === downBeam)
  const members = membersAll.filter((b) => !absorbed(b))

  const rebuild = (b: Live, isUp: boolean, pieces: { dur: number; g: number }[], C: { y: number; z: number }): Live => {
    const sLocal = Number.isNaN(b.theta) ? 0 : b.sign * Math.cos(thetaR - b.theta)
    const segs = [...b.segs]
    let tCursor = tR
    let first = true
    for (const piece of pieces) {
      const prev = segs[segs.length - 1]
      const st = segState(prev, tCursor)
      segs.push({
        t0: tCursor,
        y0: st.y,
        z0: st.z,
        vy0: st.vy,
        vz0: st.vz,
        ay: sLocal * accelOf(piece.g) * nRy,
        az: sLocal * accelOf(piece.g) * nRz,
        sLocal,
        pot: { b0: app.b0, g: piece.g, ny: nRy, nz: nRz, cy: C.y, cz: C.z },
        // the phase plate acts on the up-arm at the recombiner entry
        s0: segAction(prev, tCursor) + (isUp && first ? phiExtra : 0),
      })
      tCursor += piece.dur
      first = false
    }
    pushDrift(segs, tR + T)
    return { ...b, beam: `${X}:merged`, segs }
  }

  const ORIGIN = { y: 0, z: 0 }
  const fallbackPieces = [{ dur: T, g: -app.gradient }]

  // pair up- and down-beam branches of the same coherence group
  const byCoh = new Map<string, { up: Live[]; down: Live[] }>()
  for (const b of members) {
    const slot = byCoh.get(b.cohId) ?? { up: [], down: [] }
    if (b.beam === upBeam) slot.up.push(b)
    else slot.down.push(b)
    byCoh.set(b.cohId, slot)
  }

  const updated = new Map<Live, Live>()
  let phaseReported = false
  for (const { up, down } of byCoh.values()) {
    const nPairs = Math.min(up.length, down.length)
    for (let p = 0; p < nPairs; p++) {
      const bUp = up[p]
      const bDown = down[p]
      const stU = posAt(bUp, tR)
      const stD = posAt(bDown, tR)
      const vU = velAt(bUp, tR)
      const vD = velAt(bDown, tR)
      const C = {
        y: (stU.y + stD.y) / 2,
        z: (stU.z + stD.z) / 2,
      }
      const sU = (stU.y - C.y) * nRy + (stU.z - C.z) * nRz
      const sD = (stD.y - C.y) * nRy + (stD.z - C.z) * nRz
      const pRel = (sU - sD) / 2
      const uRel = ((vU.vy - vD.vy) * nRy + (vU.vz - vD.vz) * nRz) / 2
      // two-piece relative-motion solution: t₁ = (2p + uT)/(aG·T − u)
      const feasible = aG * T - uRel > 0 && aG * T * T - 2 * uRel * T - 2 * pRel > 0
      const pieces: { dur: number; g: number }[] = []
      if (feasible) {
        const t1 = (2 * pRel + uRel * T) / (aG * T - uRel)
        const a2 = (aG * t1 - uRel) / (T - t1)
        pieces.push({ dur: t1, g: -app.gradient })
        pieces.push({ dur: T - t1, g: a2 / accelOf(1) })
      } else {
        pieces.push(...fallbackPieces)
      }
      const nUp = rebuild(bUp, true, pieces, C)
      const nDown = rebuild(bDown, false, pieces, C)
      updated.set(bUp, nUp)
      updated.set(bDown, nDown)
      if (!phaseReported && feasible) {
        const dPhi = (actionAt(nUp, tR + T) - actionAt(nDown, tR + T)) / HBAR
        const mod = ((dPhi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
        out.push({ apparatusId: app.id, deltaPhase: mod })
        phaseReported = true
      }
    }
    // leftover members without a partner still traverse the field
    for (let p = nPairs; p < up.length; p++) updated.set(up[p], rebuild(up[p], true, fallbackPieces, ORIGIN))
    for (let p = nPairs; p < down.length; p++) updated.set(down[p], rebuild(down[p], false, fallbackPieces, ORIGIN))
  }
  return live
    .filter((b) => !onPairBeams(b) || !absorbed(b))
    .map((b) => updated.get(b) ?? b)
}

/** subset of QuantumResult needed to evaluate the packet (frames only) */
export type QuantumEnvelope = Pick<QuantumResult, 'header' | 'branches'>

// ------------------------------------------------------ coherent evaluation ---

/**
 * Interference coefficients: for each branch the diagonal |a_i|² and for each
 * same-cohId pair the complex C_ij = a_i a_j* ⟨χ_j|χ_i⟩ (plus the σ_z-resolved
 * variants for the spin asymmetry). Cached per branches array.
 */
interface PairCoeffs {
  i: number
  j: number
  /** amplitude factor for the density (⟨χ_j|χ_i⟩ included) */
  cRe: number
  cIm: number
  /** σ_z = +1 projector coefficients */
  pRe: number
  pIm: number
  /** σ_z = −1 projector coefficients */
  mRe: number
  mIm: number
}

const pairCache = new WeakMap<object, PairCoeffs[]>()

function getPairs(branches: QuantumBranch[]): PairCoeffs[] {
  const cached = pairCache.get(branches)
  if (cached) return cached
  const pairs: PairCoeffs[] = []
  const n = branches.length
  for (let i = 0; i < n; i++) {
    const bi = branches[i]
    const w2 = bi.aRe * bi.aRe + bi.aIm * bi.aIm
    const chiI = spinor(bi.spinTheta, bi.spinSign)
    const c0sq = chiI[0] * chiI[0] + chiI[1] * chiI[1]
    const c1sq = chiI[2] * chiI[2] + chiI[3] * chiI[3]
    pairs.push({
      i,
      j: i,
      cRe: w2,
      cIm: 0,
      pRe: w2 * c0sq,
      pIm: 0,
      mRe: w2 * c1sq,
      mIm: 0,
    })
  }
  for (let i = 0; i < n; i++) {
    const bi = branches[i]
    if (bi.spinSign === 0) continue
    const chiI = spinor(bi.spinTheta, bi.spinSign)
    for (let j = i + 1; j < n; j++) {
      const bj = branches[j]
      if (bj.spinSign === 0 || bj.cohId !== bi.cohId) continue
      const chiJ = spinor(bj.spinTheta, bj.spinSign)
      const so = spinOverlap(bj.spinTheta, bj.spinSign, bi.spinTheta, bi.spinSign) // ⟨χ_j|χ_i⟩
      // a_i * conj(a_j)
      const aijRe = bi.aRe * bj.aRe + bi.aIm * bj.aIm
      const aijIm = bi.aIm * bj.aRe - bi.aRe * bj.aIm
      const cRe = aijRe * so.re - aijIm * so.im
      const cIm = aijRe * so.im + aijIm * so.re
      // ⟨χ_j|↑z⟩⟨↑z|χ_i⟩ = conj(chiJ0)·chiI0 (complex), same for ↓z with c1
      const upRe = chiJ[0] * chiI[0] + chiJ[1] * chiI[1]
      const upIm = chiJ[0] * chiI[1] - chiJ[1] * chiI[0]
      const dnRe = chiJ[2] * chiI[2] + chiJ[3] * chiI[3]
      const dnIm = chiJ[2] * chiI[3] - chiJ[3] * chiI[2]
      pairs.push({
        i,
        j,
        cRe,
        cIm,
        pRe: aijRe * upRe - aijIm * upIm,
        pIm: aijRe * upIm + aijIm * upRe,
        mRe: aijRe * dnRe - aijIm * dnIm,
        mIm: aijRe * dnIm + aijIm * dnRe,
      })
    }
  }
  pairCache.set(branches, pairs)
  return pairs
}

interface BState {
  aRe: number
  aIm: number
  cx: number
  cy: number
  cz: number
  sx: number
  sy: number
  sz: number
  vy: number
  vz: number
  ph: number
}

function branchStatesAt(q: QuantumEnvelope, t: number): BState[] {
  const { branches, header } = q
  const f = Math.min(header.frameCount - 1.001, Math.max(0, t / header.timePerFrame))
  const i0 = Math.floor(f)
  const frac = f - i0
  const lerp = (a: Float64Array) => a[i0] + (a[i0 + 1] - a[i0]) * frac
  return branches.map((b) => ({
    aRe: b.aRe,
    aIm: b.aIm,
    cx: lerp(b.cx),
    cy: lerp(b.cy),
    cz: lerp(b.cz),
    sx: lerp(b.sx),
    sy: lerp(b.sy),
    sz: lerp(b.sz),
    vy: lerp(b.vy),
    vz: lerp(b.vz),
    ph: lerp(b.phase),
  }))
}

/** y-axis overlap factor of two packets (marginalization over y), complex */
function overlapAxis(ci: number, cj: number, vi: number, vj: number, sigma: number): { re: number; im: number } {
  const d = ci - cj
  const ki = (AG_MASS * vi) / HBAR
  const kj = (AG_MASS * vj) / HBAR
  const dk = ki - kj
  const mag = Math.exp((-d * d) / (8 * sigma * sigma) - (dk * dk * sigma * sigma) / 2)
  const ph = (-d * (ki + kj)) / 2
  return { re: mag * Math.cos(ph), im: mag * Math.sin(ph) }
}

/**
 * Coherent (x,z)-marginal density and σ_z asymmetry at time t (SI units).
 * rho = Re Σ_ij C_ij·o_y·ψ̃_i(x,z)ψ̃_j*(x,z), ψ̃ including the momentum tilt.
 */
export function evalRho(
  q: QuantumEnvelope,
  x: number,
  z: number,
  t: number,
): { rho: number; asym: number } {
  const states = branchStatesAt(q, t)
  const pairs = getPairs(q.branches)
  let rho = 0
  let rhoUp = 0
  let rhoDown = 0
  for (const pr of pairs) {
    const si = states[pr.i]
    const sj = states[pr.j]
    const oy = overlapAxis(si.cy, sj.cy, si.vy, sj.vy, (si.sy + sj.sy) / 2)
    const dx = (x - si.cx) / si.sx
    const dxj = (x - sj.cx) / sj.sx
    const gx = Math.exp(-(dx * dx + dxj * dxj) / 4)
    const dz = (z - si.cz) / si.sz
    const dzj = (z - sj.cz) / sj.sz
    const gz = Math.exp(-(dz * dz + dzj * dzj) / 4)
    const kz = (AG_MASS * (si.vz * (z - si.cz) - sj.vz * (z - sj.cz))) / HBAR
    const phz = si.ph - sj.ph + kz
    const cph = Math.cos(phz)
    const sph = Math.sin(phz)
    // w = o_y·e^{i·phz} (complex)
    const wRe = oy.re * cph - oy.im * sph
    const wIm = oy.re * sph + oy.im * cph
    const norm = 1 / (2 * Math.PI * si.sz * ((si.sx + sj.sx) / 2))
    const factor = pr.i === pr.j ? 1 : 2
    const base = factor * gx * gz * norm
    rho += base * (pr.cRe * wRe - pr.cIm * wIm)
    rhoUp += base * (pr.pRe * wRe - pr.pIm * wIm)
    rhoDown += base * (pr.mRe * wRe - pr.mIm * wIm)
  }
  const asym = rhoUp + rhoDown > 1e-14 ? (rhoUp - rhoDown) / (rhoUp + rhoDown) : 0
  return { rho, asym }
}

/** Marginal z-profile at a given x (for the detector histogram). */
export function evalProfile(q: QuantumEnvelope, x: number, t: number, z: number): number {
  return evalRho(q, x, z, t).rho
}

/**
 * Coherent profile along the screen-frame axis s: branches are rotated into
 * (s, t) with diagonal covariance (σ_s² = (ny·sy)² + (nz·sz)²), the t-axis is
 * marginalized with the overlap factor, and same-cohId pairs interfere.
 */
export function evalAxisProfile(
  q: QuantumEnvelope,
  x: number,
  t: number,
  f: ScreenFrame,
  s: number,
): number {
  const states = branchStatesAt(q, t)
  const pairs = getPairs(q.branches)
  let rho = 0
  for (const pr of pairs) {
    const si = states[pr.i]
    const sj = states[pr.j]
    const rot = (st: BState) => {
      const sc = (st.cy - f.cy) * f.ny + (st.cz - f.cz) * f.nz
      const tc = (st.cy - f.cy) * f.nz - (st.cz - f.cz) * f.ny
      return {
        sc,
        tc,
        vs: st.vy * f.ny + st.vz * f.nz,
        vt: st.vy * f.nz - st.vz * f.ny,
        ss: Math.hypot(f.ny * st.sy, f.nz * st.sz),
        st: Math.hypot(f.nz * st.sy, f.ny * st.sz),
      }
    }
    const ri = rot(si)
    const rj = rot(sj)
    const ot = overlapAxis(ri.tc, rj.tc, ri.vt, rj.vt, (ri.st + rj.st) / 2)
    const gx = Math.exp(
      -(((x - si.cx) / si.sx) ** 2 + ((x - sj.cx) / sj.sx) ** 2) / 4,
    )
    const ds = (s - ri.sc) / ri.ss
    const dsj = (s - rj.sc) / rj.ss
    const gs = Math.exp(-(ds * ds + dsj * dsj) / 4)
    const ks = (AG_MASS * (ri.vs * (s - ri.sc) - rj.vs * (s - rj.sc))) / HBAR
    const phs = si.ph - sj.ph + ks
    const cph = Math.cos(phs)
    const sph = Math.sin(phs)
    const wRe = ot.re * cph - ot.im * sph
    const wIm = ot.re * sph + ot.im * cph
    const cRe = pr.cRe * wRe - pr.cIm * wIm
    const sigS = (ri.ss + rj.ss) / 2
    const sigT = (ri.st + rj.st) / 2
    const factor = pr.i === pr.j ? 1 : 2
    rho += (factor * gx * gs * cRe) / (2 * Math.PI * sigS * sigT)
  }
  return rho
}

/** max |center| + 4σ extent of the branches projected on the screen-frame axis (meters) */
export function maxAxisExtent(q: QuantumEnvelope, f: ScreenFrame): number {
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

/**
 * Monte-Carlo detector sampling from the COHERENT density:
 * arrival times follow the flux through the screen plane (for packets sharing
 * v_x the current j_x reduces to v_x·ρ — the x-marginal of the coherent
 * density with the transverse overlap factors), z-positions are drawn from the
 * coherent z-marginal via a numeric CDF per frame, and the spin outcome is a
 * Born sample of the local spinor measured along the screen-frame axis.
 * Deterministic for a given seed.
 */
export function sampleScreenHits(
  q: QuantumEnvelope,
  screenX: number,
  count: number,
  seed: number,
  frameThetaRad = 0,
): ScreenHits {
  const rng = new Pcg32(seed >>> 0, 777n)
  const { header } = q
  const pairs = getPairs(q.branches)

  // arrival-time CDF from the coherent x-flux at the screen
  const flux = (t: number) => {
    const states = branchStatesAt(q, t)
    let sRe = 0
    for (const pr of pairs) {
      const si = states[pr.i]
      const sj = states[pr.j]
      const oy = overlapAxis(si.cy, sj.cy, si.vy, sj.vy, (si.sy + sj.sy) / 2)
      const oz = overlapAxis(si.cz, sj.cz, si.vz, sj.vz, (si.sz + sj.sz) / 2)
      const dx = (screenX - si.cx) / si.sx
      const dxj = (screenX - sj.cx) / sj.sx
      const gx = Math.exp(-(dx * dx + dxj * dxj) / 4)
      const phz = si.ph - sj.ph
      // o_y·o_z (complex product)
      const oRe = oy.re * oz.re - oy.im * oz.im
      const oIm = oy.re * oz.im + oy.im * oz.re
      const cRe = pr.cRe * oRe - pr.cIm * oIm
      const cIm = pr.cRe * oIm + pr.cIm * oRe
      const factor = pr.i === pr.j ? 1 : 2
      sRe += (factor * gx * (cRe * Math.cos(phz) - cIm * Math.sin(phz))) / (Math.sqrt(2 * Math.PI) * si.sx)
    }
    return Math.max(0, sRe)
  }
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

  // per-frame z-marginal CDF (lazy): coherent density over z at the screen x
  const MZ = 512
  const frameCdf = new Map<number, { zs: Float64Array; cdf: Float64Array }>()
  const zCdfFor = (frameIdx: number) => {
    const hit = frameCdf.get(frameIdx)
    if (hit) return hit
    const t = frameIdx * header.timePerFrame
    const states = branchStatesAt(q, t)
    const zs = new Float64Array(MZ)
    const cdfZ = new Float64Array(MZ)
    let zLo = Infinity
    let zHi = -Infinity
    for (const st of states) {
      zLo = Math.min(zLo, st.cz - 5 * st.sz)
      zHi = Math.max(zHi, st.cz + 5 * st.sz)
    }
    if (!Number.isFinite(zLo)) {
      zLo = header.zMin
      zHi = header.zMax
    }
    let acc = 0
    for (let j = 0; j < MZ; j++) {
      const z = zLo + ((zHi - zLo) * (j + 0.5)) / MZ
      zs[j] = z
      let sRe = 0
      for (const pr of pairs) {
        const si = states[pr.i]
        const sj = states[pr.j]
        const oy = overlapAxis(si.cy, sj.cy, si.vy, sj.vy, (si.sy + sj.sy) / 2)
        const dx = (screenX - si.cx) / si.sx
        const dxj = (screenX - sj.cx) / sj.sx
        const gx = Math.exp(-(dx * dx + dxj * dxj) / 4)
        const dz = (z - si.cz) / si.sz
        const dzj = (z - sj.cz) / sj.sz
        const gz = Math.exp(-(dz * dz + dzj * dzj) / 4)
        const kz = (AG_MASS * (si.vz * (z - si.cz) - sj.vz * (z - sj.cz))) / HBAR
        const phz = si.ph - sj.ph + kz
        const cph = Math.cos(phz)
        const sph = Math.sin(phz)
        const wRe = oy.re * cph - oy.im * sph
        const wIm = oy.re * sph + oy.im * cph
        const factor = pr.i === pr.j ? 1 : 2
        sRe += (factor * gx * gz * (pr.cRe * wRe - pr.cIm * wIm)) / (2 * Math.PI * si.sz * si.sx)
      }
      const p = Math.max(0, sRe)
      acc += p
      cdfZ[j] = acc
    }
    const entry = { zs, cdf: cdfZ }
    frameCdf.set(frameIdx, entry)
    return entry
  }

  const times = new Float64Array(count)
  const ys = new Float64Array(count)
  const zs = new Float64Array(count)
  const thetas = new Float64Array(count)
  const signs = new Int8Array(count)

  const chiF = spinor(frameThetaRad, 1)

  for (let k = 0; k < count; k++) {
    // invert the arrival-time CDF
    const u = rng.nextFloat() * total
    let j = 1
    while (j < M - 1 && cdf[j] < u) j++
    const fr = (u - cdf[j - 1]) / (cdf[j] - cdf[j - 1] || 1)
    const t = ts[j - 1] + fr * (ts[j] - ts[j - 1])
    const frameIdx = Math.min(
      header.frameCount - 1,
      Math.max(0, Math.round(t / header.timePerFrame)),
    )
    const { zs: zGrid, cdf: zCdf } = zCdfFor(frameIdx)
    const zTotal = zCdf[MZ - 1] || 1e-300
    let z = zGrid[0]
    {
      const uz = rng.nextFloat() * zTotal
      let lo = 0
      let hi = MZ - 1
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (zCdf[mid] < uz) lo = mid + 1
        else hi = mid
      }
      z = zGrid[lo]
    }
    times[k] = t
    zs[k] = z

    const states = branchStatesAt(q, frameIdx * header.timePerFrame)
    // pick the contributing branch proportionally to its local z-density,
    // draw y from it, then evaluate the local spinor at (y, z): the y-factor
    // carries which-path information for transverse (e.g. Y-axis) splits
    let bestW = -1
    let bestIdx = 0
    for (let i = 0; i < states.length; i++) {
      const st = states[i]
      const w2 = st.aRe * st.aRe + st.aIm * st.aIm
      const bw = w2 * Math.exp(-((z - st.cz) ** 2) / (2 * st.sz * st.sz))
      if (bw > bestW) {
        bestW = bw
        bestIdx = i
      }
    }
    const best = states[bestIdx]
    const y = best.cy + best.sy * rng.normal()
    ys[k] = y

    // local spinor at (y, z): s = Σ_i a_i ψ_i(y,z) χ_i, then Born along frame axis
    let s0r = 0
    let s0i = 0
    let s1r = 0
    let s1i = 0
    for (let i = 0; i < states.length; i++) {
      const st = states[i]
      const chiI = spinor(q.branches[i].spinTheta, q.branches[i].spinSign)
      const amp = Math.exp(
        -((y - st.cy) ** 2) / (4 * st.sy * st.sy) - ((z - st.cz) ** 2) / (4 * st.sz * st.sz),
      )
      const ph =
        st.ph +
        (AG_MASS * (st.vy * (y - st.cy) + st.vz * (z - st.cz))) / HBAR
      const ar = st.aRe * amp
      const ai = st.aIm * amp
      const wr = ar * Math.cos(ph) - ai * Math.sin(ph)
      const wi = ar * Math.sin(ph) + ai * Math.cos(ph)
      s0r += wr * chiI[0] - wi * chiI[1]
      s0i += wi * chiI[0] + wr * chiI[1]
      s1r += wr * chiI[2] - wi * chiI[3]
      s1i += wi * chiI[2] + wr * chiI[3]
    }
    // Born along the screen-frame axis: ⟨χ_f,+|s⟩
    const m0r = chiF[0] * s0r + chiF[1] * s0i + chiF[2] * s1r + chiF[3] * s1i
    const m0i = chiF[0] * s0i - chiF[1] * s0r + chiF[2] * s1i - chiF[3] * s1r
    const pUp = m0r * m0r + m0i * m0i
    const normS = s0r * s0r + s0i * s0i + s1r * s1r + s1i * s1i
    const up = normS > 1e-300 ? rng.nextFloat() < pUp / normS : rng.nextFloat() < 0.5
    signs[k] = up ? 1 : -1
    thetas[k] = q.branches[bestIdx].spinTheta
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
