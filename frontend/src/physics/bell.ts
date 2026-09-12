import { Pcg32 } from './rng'

/**
 * Bell/CHSH experiment engine (idealized spin-1/2 pairs, SG-analyzer stations).
 *
 * Layout mirrors Hensen et al., Nature 526, 682 (2015):
 * an entangled pair source in the middle, two stations (A left, B right),
 * each with two preset analyzer angles; a per-pair random setting choice
 * ("QRNG"); binary outcomes ±1; CHSH S = E00 + E01 + E10 − E11, bound S ≤ 2
 * for local realism, quantum singlet reaches 2√2 at optimal angles.
 *
 * Models:
 *  - 'quantum': singlet |ψ−⟩, E(a,b) = −cos(θa − θb); sampled pair-by-pair
 *  - 'local':  local hidden variables — each pair carries a predetermined
 *              hidden direction φ; outcomes x = sign(cos(θa − φ)),
 *              y = −sign(cos(θb − φ)). Bell's theorem ⇒ S ≤ 2 always.
 *
 * Sliders: detection efficiency η (detection loophole) and pair-level
 * visibility V (white-noise mixing, E → V·E).
 */

export type BellModel = 'quantum' | 'local'

export interface BellConfig {
  model: BellModel
  /** analyzer angles [setting0, setting1] per station, degrees */
  anglesA: [number, number]
  anglesB: [number, number]
  pairs: number
  detectionEff: number
  visibility: number
  seed: number
}

export interface BellResult {
  nPairs: number
  nHero: number
  /** [n] pair birth time at the source (s) */
  tBirth: Float64Array
  /** [n] time both particles reach their analyzer (s) */
  tMeasure: Float64Array
  /** [n] time the detector dot appears (s) */
  tLand: Float64Array
  settingA: Uint8Array
  settingB: Uint8Array
  /** [n] realized analyzer angle (rad) on each side */
  angleA: Float64Array
  angleB: Float64Array
  /** [n] recorded outcome (+1/−1) or 0 if that side did not detect */
  outcomeA: Int8Array
  outcomeB: Int8Array
  /** valid trials = both sides detected */
  trials: number
  /** counts[settingA][settingB] over valid trials */
  counts: number[][]
  /** E[a][b] = <x·y> over valid trials */
  E: number[][]
  S: number
  /** cumulative S at checkpoints */
  sCurve: Float64Array
  sCurveN: Float64Array
  tTotal: number
}

/** scene layout, meters (shared with the 3D scene) */
export const BELL_LAYOUT = {
  stationX: 0.21,
  magnetLen: 0.12,
  detectorX: 0.31,
  v: 500,
}

const TAU = Math.PI * 2

export function runBell(cfg: BellConfig): BellResult {
  const rng = new Pcg32(cfg.seed >>> 0, 97n)
  const n = cfg.pairs
  const nHero = Math.min(140, n)

  const tBirth = new Float64Array(n)
  const tMeasure = new Float64Array(n)
  const tLand = new Float64Array(n)
  const settingA = new Uint8Array(n)
  const settingB = new Uint8Array(n)
  const angleA = new Float64Array(n)
  const angleB = new Float64Array(n)
  const outcomeA = new Int8Array(n)
  const outcomeB = new Int8Array(n)

  const flight = BELL_LAYOUT.stationX / BELL_LAYOUT.v
  const tEmit = 0.3 * ((BELL_LAYOUT.detectorX + 0.05) / BELL_LAYOUT.v)
  const quantum = cfg.model === 'quantum'
  const eta = cfg.detectionEff
  const vis = cfg.visibility

  const counts = [
    [0, 0],
    [0, 0],
  ]
  const sums = [
    [0, 0],
    [0, 0],
  ]
  let trials = 0
  const curve: number[] = []
  const curveN: number[] = []
  const checkpoint = Math.max(1, Math.floor(n / 240))
  let tMax = 0

  for (let i = 0; i < n; i++) {
    const t0 = i < nHero ? (tEmit * (i + 0.5)) / nHero : rng.nextFloat() * tEmit
    tBirth[i] = t0
    tMeasure[i] = t0 + flight
    tLand[i] = t0 + BELL_LAYOUT.detectorX / BELL_LAYOUT.v
    if (tLand[i] > tMax) tMax = tLand[i]

    const sa = rng.nextFloat() < 0.5 ? 0 : 1
    const sb = rng.nextFloat() < 0.5 ? 0 : 1
    settingA[i] = sa
    settingB[i] = sb
    const tha = (cfg.anglesA[sa] * Math.PI) / 180
    const thb = (cfg.anglesB[sb] * Math.PI) / 180
    angleA[i] = tha
    angleB[i] = thb

    let x: number
    let y: number
    if (quantum) {
      // Alice uniform; Bob with P(y = x) = (1 + E)/2, E = -cos(Δ)
      x = rng.nextFloat() < 0.5 ? 1 : -1
      const d = tha - thb
      const E = -Math.cos(d)
      y = rng.nextFloat() < (1 + E) / 2 ? x : -x
    } else {
      // local hidden variable: predetermined direction φ in the analyzer plane
      const phi = rng.nextFloat() * TAU
      x = Math.cos(tha - phi) >= 0 ? 1 : -1
      y = Math.cos(thb - phi) >= 0 ? -1 : 1
    }
    // pair-level white noise (visibility)
    if (rng.nextFloat() >= vis) {
      x = rng.nextFloat() < 0.5 ? 1 : -1
      y = rng.nextFloat() < 0.5 ? 1 : -1
    }
    // independent detection on each side
    const detA = rng.nextFloat() < eta ? 1 : 0
    const detB = rng.nextFloat() < eta ? 1 : 0
    outcomeA[i] = detA ? (x as 1 | -1) : 0
    outcomeB[i] = detB ? (y as 1 | -1) : 0

    if (detA && detB) {
      counts[sa][sb]++
      sums[sa][sb] += x * y
      trials++
      if (trials % checkpoint === 0) {
        curve.push(chsh(sums, counts))
        curveN.push(trials)
      }
    }
  }

  const E = [
    [counts[0][0] ? sums[0][0] / counts[0][0] : 0, counts[0][1] ? sums[0][1] / counts[0][1] : 0],
    [counts[1][0] ? sums[1][0] / counts[1][0] : 0, counts[1][1] ? sums[1][1] / counts[1][1] : 0],
  ]
  const S = chsh(sums, counts)

  return {
    nPairs: n,
    nHero,
    tBirth,
    tMeasure,
    tLand,
    settingA,
    settingB,
    angleA,
    angleB,
    outcomeA,
    outcomeB,
    trials,
    counts,
    E,
    S,
    sCurve: new Float64Array(curve),
    sCurveN: new Float64Array(curveN),
    tTotal: tMax + 0.05 * flight,
  }
}

function chsh(sums: number[][], counts: number[][]): number {
  const e = (a: number, b: number) => (counts[a][b] ? sums[a][b] / counts[a][b] : 0)
  return e(0, 0) + e(0, 1) + e(1, 0) - e(1, 1)
}

/** theoretical quantum S for given angles and visibility */
export function quantumS(
  anglesA: [number, number],
  anglesB: [number, number],
  vis: number,
): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const E = (a: number, b: number) =>
    -vis * Math.cos(rad(anglesA[a]) - rad(anglesB[b]))
  return E(0, 0) + E(0, 1) + E(1, 0) - E(1, 1)
}

/** Hensen 2015 readout bases (degrees, from numerical optimization in the paper) */
export const HENSEN_ANGLES: BellConfig = {
  model: 'quantum',
  anglesA: [0, 90],
  anglesB: [-139.7, 139.7],
  pairs: 50000,
  detectionEff: 1,
  visibility: 1,
  seed: 42,
}
