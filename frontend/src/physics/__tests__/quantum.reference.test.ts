import { describe, expect, it } from 'vitest'
import {
  evalRho,
  overlapAxis,
  sampleScreenHits,
  spinor,
  spinOverlap,
  type QuantumBranch,
  type QuantumEnvelope,
  type QuantumHeader,
} from '../quantum'
import { AG_MASS, HBAR } from '../constants'

/**
 * Independent-reference tests for the coherent quantum model.
 *
 * Every reference here is computed from the DEFINITION of the quantity with
 * explicit complex arithmetic (and, where possible, numerical integration),
 * sharing no density/sampling code with the implementation under test — only
 * the (separately tested) spinor basis.
 *
 * Conventions (must match src/physics/quantum.ts):
 *   axis n(θ) = (−sinθ, 0, cosθ); spinor |χ_(θ,s)⟩ in the σz basis
 *   (re↑, im↑, re↓, im↓); branch wave packet
 *     ψ_i(x,y,z) = exp(−(x−cx)²/4σx² − (y−cy)²/4σy² − (z−cz)²/4σz²)
 *                  · exp{i[S_i/ħ + k_iy(y−cy) + k_iz(z−cz)]},
 *   k = m·v/ħ; the density is
 *     ρ = Σ_i |a_i|²|ψ_i|² + 2Re Σ_{i<j} a_i a_j* ⟨χ_j|χ_i⟩ ψ_i ψ_j* .
 */

// ------------------------------------------------------------ helpers ---

const FRAMES = 4

const HEADER: QuantumHeader = {
  frameCount: FRAMES,
  timePerFrame: 1e-3,
  tTotal: FRAMES * 1e-3,
  xMin: -0.01,
  xMax: 0.02,
  zMin: -0.05,
  zMax: 0.05,
  cols: 8,
  rows: 8,
}

interface BranchSpec {
  aRe: number
  aIm: number
  cohId: string
  spinTheta: number
  spinSign: number
  cx?: number
  cy: number
  cz: number
  sx?: number
  sy: number
  sz: number
  vy: number
  vz: number
  ph: number
}

function constArr(v: number): Float64Array {
  return Float64Array.from({ length: FRAMES }, () => v)
}

function makeEnvelope(specs: BranchSpec[]): QuantumEnvelope {
  const branches: QuantumBranch[] = specs.map((s) => ({
    weight: s.aRe * s.aRe + s.aIm * s.aIm,
    aRe: s.aRe,
    aIm: s.aIm,
    cohId: s.cohId,
    spinTheta: s.spinTheta,
    spinSign: s.spinSign,
    cx: constArr(s.cx ?? 0),
    cy: constArr(s.cy),
    cz: constArr(s.cz),
    sx: constArr(s.sx ?? 0.01),
    sy: constArr(s.sy),
    sz: constArr(s.sz),
    vy: constArr(s.vy),
    vz: constArr(s.vz),
    phase: constArr(s.ph),
  }))
  return { header: HEADER, branches }
}

/** normalized 1D Gaussian amplitude: (2πσ²)^{−1/4}·exp(−(r−c)²/(4σ²)) */
const psiAmp = (r: number, c: number, sig: number) =>
  Math.pow(2 * Math.PI * sig * sig, -0.25) * Math.exp(-((r - c) ** 2) / (4 * sig * sig))

/** complex multiply helper */
function cmul(ar: number, ai: number, br: number, bi: number): [number, number] {
  return [ar * br - ai * bi, ar * bi + ai * br]
}

/**
 * DIRECT reference: the y-marginalized coherent density at (x, z), computed
 * from the definition. The y-integral of every term (diagonal and cross) is
 * done numerically — no overlapAxis, no getPairs.
 */
function refRhoXZ(q: QuantumEnvelope, x: number, z: number, t: number): number {
  const f = Math.min(q.header.frameCount - 1, Math.max(0, t / q.header.timePerFrame))
  const i0 = Math.floor(f)
  const at = (a: Float64Array) => a[i0]
  const bs = q.branches
  // numeric y-integral grid: covers every packet center ± 12σ
  let lo = Infinity
  let hi = -Infinity
  let syMin = Infinity
  for (const b of bs) {
    lo = Math.min(lo, at(b.cy) - 12 * at(b.sy))
    hi = Math.max(hi, at(b.cy) + 12 * at(b.sy))
    syMin = Math.min(syMin, at(b.sy))
  }
  const N = 40001
  const dy = (hi - lo) / (N - 1)
  let acc = 0
  for (let g = 0; g < N; g++) {
    const y = lo + g * dy
    // ψ_i(y,z)ψ_j*(y,z) summed with the spin overlaps: ρ = Σ_ij a_i a_j* ⟨χ_j|χ_i⟩ ψ_i ψ_j*
    let rowRe = 0
    let rowIm = 0
    for (let i = 0; i < bs.length; i++) {
      const bi = bs[i]
      const ai = psiAmp(y, at(bi.cy), at(bi.sy)) * psiAmp(z, at(bi.cz), at(bi.sz)) * psiAmp(x, at(bi.cx), at(bi.sx))
      if (ai < 1e-300) continue
      const phI =
        at(bi.phase) +
        (AG_MASS * (bi.vy[i0] * (y - at(bi.cy)) + bi.vz[i0] * (z - at(bi.cz)))) / HBAR
      for (let j = 0; j < bs.length; j++) {
        const bj = bs[j]
        const so = spinOverlap(bj.spinTheta, bj.spinSign, bi.spinTheta, bi.spinSign) // ⟨χ_j|χ_i⟩
        if (so.re === 0 && so.im === 0 && i !== j) continue
        const aj = psiAmp(y, at(bj.cy), at(bj.sy)) * psiAmp(z, at(bj.cz), at(bj.sz)) * psiAmp(x, at(bj.cx), at(bj.sx))
        const phJ =
          at(bj.phase) +
          (AG_MASS * (bj.vy[i0] * (y - at(bj.cy)) + bj.vz[i0] * (z - at(bj.cz)))) / HBAR
        // a_i · conj(a_j)
        const [car, cai] = cmul(bi.aRe, bi.aIm, bj.aRe, -bj.aIm)
        // (a_i conj(a_j)) · ⟨χ_j|χ_i⟩
        const [cr, ci] = cmul(car, cai, so.re, so.im)
        // ψ_i ψ_j* = ai·aj · e^{i(phI − phJ)}
        const env = ai * aj
        const wr = env * Math.cos(phI - phJ)
        const wi = env * Math.sin(phI - phJ)
        const [pr, pi] = cmul(cr, ci, wr, wi)
        rowRe += pr
        rowIm += pi
      }
    }
    acc += rowRe // Im vanishes analytically; checked below
  }
  void syMin
  return acc * dy
}

describe('coherence semantics of the density', () => {
  // Fully co-located pair (Δc = 0, Δv = 0), a₁ = a₂ = √½. At the packet center
  // the y-marginalized density is (up to the shared envelope):
  //   coherent, φ = 0:      |a₁+a₂|² = 2      (constructive)
  //   coherent, φ = π:      |a₁−a₂|² = 0      (destructive)
  //   incoherent mixture:   |a₁|²+|a₂|² = 1   (phase-independent)
  //   coherent, orthogonal spinors: 1         (⟨χ_j|χ_i⟩ = 0 kills the cross term)
  const mkPair = (cohId2: string, ph2: number, theta2: number, sign2: number) =>
    makeEnvelope([
      {
        aRe: Math.SQRT1_2, aIm: 0, cohId: 'g', spinTheta: 0, spinSign: 1,
        cy: 0, cz: 0, sy: 1e-3, sz: 1e-3, vy: 0, vz: 0, ph: 0,
      },
      {
        aRe: Math.SQRT1_2, aIm: 0, cohId: cohId2, spinTheta: theta2, spinSign: sign2,
        cy: 0, cz: 0, sy: 1e-3, sz: 1e-3, vy: 0, vz: 0, ph: ph2,
      },
    ])
  const centerRho = (q: QuantumEnvelope) => evalRho(q, 0, 0, 1e-3).rho
  const base = centerRho(
    makeEnvelope([
      {
        aRe: 1, aIm: 0, cohId: 'g', spinTheta: 0, spinSign: 1,
        cy: 0, cz: 0, sy: 1e-3, sz: 1e-3, vy: 0, vz: 0, ph: 0,
      },
    ]),
  )

  it('coherent constructive interference doubles the density', () => {
    expect(centerRho(mkPair('g', 0, 0, 1)) / base).toBeCloseTo(2, 9)
  })
  it('coherent destructive interference (φ = π) cancels it', () => {
    expect(centerRho(mkPair('g', Math.PI, 0, 1)) / base).toBeCloseTo(0, 9)
  })
  it('a mixed state never interferes: density is the diagonal sum', () => {
    expect(centerRho(mkPair('other', 0, 0, 1)) / base).toBeCloseTo(1, 9)
    expect(centerRho(mkPair('other', Math.PI, 0, 1)) / base).toBeCloseTo(1, 9)
  })
  it('orthogonal spinors suppress the interference even when coherent', () => {
    // χ(0°,+) ⊥ χ(0°,−): phase-independent diagonal sum
    expect(centerRho(mkPair('g', 0, 0, -1)) / base).toBeCloseTo(1, 9)
    expect(centerRho(mkPair('g', Math.PI, 0, -1)) / base).toBeCloseTo(1, 9)
  })
  it('no spatial overlap → no interference (separated packets reduce to the mixture)', () => {
    const far = makeEnvelope([
      {
        aRe: Math.SQRT1_2, aIm: 0, cohId: 'g', spinTheta: 0, spinSign: 1,
        cy: 0, cz: -0.02, sy: 1e-3, sz: 1e-3, vy: 0, vz: 0, ph: 0,
      },
      {
        aRe: Math.SQRT1_2, aIm: 0, cohId: 'g', spinTheta: 0, spinSign: 1,
        cy: 0, cz: 0.02, sy: 1e-3, sz: 1e-3, vy: 0, vz: 0, ph: 0,
      },
    ])
    // at the lobe center each branch carries ½ of the weight-1 envelope and
    // the cross term is e^{−(Δz/σ)²/8} = e^{−200}: same value as a mixture
    expect(evalRho(far, 0, -0.02, 1e-3).rho / base).toBeCloseTo(0.5, 6)
    expect(evalRho(far, 0, 0.02, 1e-3).rho / base).toBeCloseTo(0.5, 6)
    // and the dip in the middle is total
    expect(evalRho(far, 0, 0, 1e-3).rho / base).toBeLessThan(1e-80)
  })
})

describe('spinors are eigenstates of σ·n(θ)', () => {
  // σ·n with n = (−sinθ, 0, cosθ):  σy = [[0, −i],[i, 0]] so
  // σ·n = [[nz, −i·ny], [i·ny, −nz]]; entries as (re, im) pairs
  const sigmaN = (theta: number): [number, number][][] => [
    [
      [Math.cos(theta), 0],
      [0, Math.sin(theta)], // −i·ny = −i·(−sinθ) = i·sinθ
    ],
    [
      [0, -Math.sin(theta)], // i·ny = −i·sinθ
      [-Math.cos(theta), 0],
    ],
  ]
  const apply = (
    m: [number, number][][],
    v: [number, number, number, number],
  ): [number, number, number, number] => {
    const mul = (a: [number, number], br: number, bi: number): [number, number] => [
      a[0] * br - a[1] * bi,
      a[0] * bi + a[1] * br,
    ]
    const [r0, i0] = mul(m[0][0], v[0], v[1])
    const [r01, i01] = mul(m[0][1], v[2], v[3])
    const [r1, i1] = mul(m[1][0], v[0], v[1])
    const [r11, i11] = mul(m[1][1], v[2], v[3])
    return [r0 + r01, i0 + i01, r1 + r11, i1 + i11]
  }
  it('σ·n |χ_(θ,±)⟩ = ±|χ_(θ,±)⟩ for a sweep of angles', () => {
    for (let deg = 0; deg < 360; deg += 7) {
      const th = (deg * Math.PI) / 180
      const m = sigmaN(th)
      for (const s of [1, -1] as const) {
        const chi = spinor(th, s)
        const out = apply(m, chi)
        expect(out[0]).toBeCloseTo(s * chi[0], 12)
        expect(out[1]).toBeCloseTo(s * chi[1], 12)
        expect(out[2]).toBeCloseTo(s * chi[2], 12)
        expect(out[3]).toBeCloseTo(s * chi[3], 12)
      }
    }
  })
})

describe('overlapAxis matches direct numerical integration', () => {
  // ∫ψ_i(y)ψ_j*(y)dy with ψ ∝ e^{iS/ħ}·e^{ik(y−c)}; k = m·v/ħ
  const psiY = (y: number, c: number, sig: number, k: number): [number, number] => {
    const amp = Math.pow(2 * Math.PI * sig * sig, -0.25) * Math.exp(-((y - c) ** 2) / (4 * sig * sig))
    const ph = k * (y - c)
    return [amp * Math.cos(ph), amp * Math.sin(ph)]
  }
  const kOf = (v: number) => (AG_MASS * v) / HBAR

  const check = (c1: number, v1: number, c2: number, v2: number, sig: number) => {
    const got = overlapAxis(c1, c2, v1, v2, sig)
    const k1 = kOf(v1)
    const k2 = kOf(v2)
    // integrate ψ_i·conj(ψ_j) over a wide window with a fine midpoint rule
    const lo = Math.min(c1, c2) - 12 * sig
    const hi = Math.max(c1, c2) + 12 * sig
    const N = 200001
    const dy = (hi - lo) / N
    let re = 0
    let im = 0
    for (let g = 0; g < N; g++) {
      const y = lo + (g + 0.5) * dy
      const [ir, ii] = psiY(y, c1, sig, k1)
      const [jr, ji] = psiY(y, c2, sig, k2)
      // ψ_i · conj(ψ_j) = (ir + i·ii)(jr − i·ji)
      re += ir * jr + ii * ji
      im += ii * jr - ir * ji
    }
    re *= dy
    im *= dy
    const gotMag = Math.hypot(got.re, got.im)
    const refMag = Math.hypot(re, im)
    expect(refMag).toBeGreaterThan(1e-12) // a meaningful reference
    // magnitude
    expect(Math.abs(gotMag - refMag) / refMag).toBeLessThan(1e-9)
    // phase (careful near zero magnitude)
    const dot = (got.re * re + got.im * im) / (refMag * refMag)
    expect(dot).toBeGreaterThan(1 - 1e-9)
  }

  it('symmetric split (both signs of c and v)', () => {
    check(1e-4, 6e-7, -1e-4, -6e-7, 1e-3)
    check(2e-4, 8e-7, -2e-4, -8e-7, 5e-4)
  })
  it('asymmetric case: common offset AND momentum along y (regression)', () => {
    // here the old formula −(c1−c2)(k1+k2)/2 is off by k1·c2 − k2·c1
    check(4e-4, 6e-7, 2e-4, -6e-7, 1e-3)
    check(-1e-4, 3e-7, 5e-4, -9e-7, 8e-4)
    check(0, 6e-7, 3e-4, 1.5e-7, 1e-3)
  })
})

describe('evalRho equals the direct reference density', () => {
  it('two coherent branches with offset+momentum along y and a relative phase', () => {
    const q = makeEnvelope([
      {
        aRe: 0.8,
        aIm: 0,
        cohId: 'g',
        spinTheta: 0,
        spinSign: 1,
        cy: 4e-4,
        cz: -1.5e-3,
        sy: 1e-3,
        sz: 1e-3,
        vy: 6e-7,
        vz: 0,
        ph: 1.3,
      },
      {
        aRe: 0,
        aIm: 0.6,
        cohId: 'g',
        spinTheta: Math.PI / 2,
        spinSign: 1,
        cy: 2e-4,
        cz: 1.5e-3,
        sy: 1e-3,
        sz: 1e-3,
        vy: -6e-7,
        vz: 0,
        ph: -0.7,
      },
    ])
    const norm = 0.8 * 0.8 + 0.6 * 0.6
    for (const [x, z] of [
      [0, 0],
      [0.001, -1e-3],
      [0.001, 1.2e-3],
      [0.001, 0],
      [-0.0005, 0.5e-3],
    ]) {
      const got = evalRho(q, x, z, 1e-3).rho / norm
      const ref = refRhoXZ(q, x, z, 1e-3) / norm
      expect(Math.abs(ref)).toBeGreaterThan(1e-30)
      expect(Math.abs(got - ref) / Math.abs(ref)).toBeLessThan(2e-6)
    }
  })
  it('density is real and non-negative up to round-off (coherent + mixed)', () => {
    const qc = makeEnvelope([
      {
        aRe: 0.8,
        aIm: 0,
        cohId: 'g',
        spinTheta: 0,
        spinSign: 1,
        cy: 4e-4,
        cz: 0,
        sy: 1e-3,
        sz: 1e-3,
        vy: 6e-7,
        vz: 0,
        ph: 1.3,
      },
      {
        aRe: 0,
        aIm: 0.6,
        cohId: 'g',
        spinTheta: Math.PI / 2,
        spinSign: 1,
        cy: 2e-4,
        cz: 0,
        sy: 1e-3,
        sz: 1e-3,
        vy: -6e-7,
        vz: 0,
        ph: -0.7,
      },
    ])
    const qm = makeEnvelope([
      {
        aRe: 1,
        aIm: 0,
        cohId: 'mA',
        spinTheta: 0,
        spinSign: 1,
        cy: 0,
        cz: -1e-3,
        sy: 1e-3,
        sz: 1e-3,
        vy: 0,
        vz: 0,
        ph: 0,
      },
      {
        aRe: 1,
        aIm: 0,
        cohId: 'mB',
        spinTheta: 0,
        spinSign: 1,
        cy: 0,
        cz: 1e-3,
        sy: 1e-3,
        sz: 1e-3,
        vy: 0,
        vz: 0,
        ph: 0,
      },
    ])
    for (const q of [qc, qm]) {
      let scale = 0
      for (let z = -0.004; z <= 0.004; z += 1e-4) {
        const { rho } = evalRho(q, 0, z, 1e-3)
        scale = Math.max(scale, rho)
      }
      for (let z = -0.004; z <= 0.004; z += 1e-4) {
        const { rho } = evalRho(q, 0, z, 1e-3)
        expect(rho).toBeGreaterThan(-1e-12 * scale)
      }
    }
  })
})

describe('screen hits follow the coherent joint density (y,z)', () => {
  it('fully overlapped coherent pair with a π phase: central dip is sampled (regression)', () => {
    // Two same-cohId branches, identical widths, Δy = 0.25σ, relative phase π.
    // The coherent density has a deep dip at y = 0 (destructive interference);
    // a diagonal-weights mixture has none. N independent of the sampler.
    const sig = 1e-3
    const d = 0.25 * sig
    const q = makeEnvelope([
      {
        aRe: Math.SQRT1_2,
        aIm: 0,
        cohId: 'g',
        spinTheta: 0,
        spinSign: 1,
        cy: -d,
        cz: 0,
        sy: sig,
        sz: sig,
        vy: 0,
        vz: 0,
        ph: 0,
      },
      {
        aRe: Math.SQRT1_2,
        aIm: 0,
        cohId: 'g',
        spinTheta: 0,
        spinSign: 1,
        cy: d,
        cz: 0,
        sy: sig,
        sz: sig,
        vy: 0,
        vz: 0,
        ph: Math.PI,
      },
    ])
    const N = 40000
    const hits = sampleScreenHits(q, 0, N, 12345)
    // reference fraction of mass with |y| < 0.2σ, from the definition
    let num = 0
    let den = 0
    for (let g = 0; g < 200000; g++) {
      const y = -5 * sig + (10 * sig * (g + 0.5)) / 200000
      // ρ(y) ∝ (e^{-(y-d)²/2σ²} + e^{-(y+d)²/2σ²})/2 − e^{-(y²+d²)/2σ²}
      const p =
        0.5 * Math.exp(-((y - d) ** 2) / (2 * sig * sig)) +
        0.5 * Math.exp(-((y + d) ** 2) / (2 * sig * sig)) -
        Math.exp(-((y * y + d * d) / (2 * sig * sig)))
      const w = p > 0 ? p : 0
      if (Math.abs(y) < 0.2 * sig) num += w
      den += w
    }
    const pRef = num / den
    let central = 0
    for (let i = 0; i < N; i++) if (Math.abs(hits.ys[i]) < 0.2 * sig) central++
    const pGot = central / N
    const sigma = Math.sqrt((pRef * (1 - pRef)) / N)
    expect(pRef).toBeLessThan(0.05) // the dip is real
    expect(Math.abs(pGot - pRef)).toBeLessThan(4 * sigma + 0.002)
  })

  it('mixed state (incoherent components) shows no spin interference', () => {
    // Two branches with DIFFERENT cohIds (statistical mixture), identical
    // spatial packets, spinors +z and −x, amplitudes 1/√2 each, relative
    // phase π/2 between the mixture components. Correct Born statistics for
    // the mixture: P(+ along z) = ½·1 + ½·½ = 0.75 EXACTLY, independent of
    // the relative phase. Summing amplitudes across the two components would
    // instead give (0.75 + (√2/2)·sin φ)/(1 + (√2/2)·sin φ) ≈ 0.854 at φ=π/2.
    const q = makeEnvelope([
      {
        aRe: Math.SQRT1_2,
        aIm: 0,
        cohId: 'mix-A',
        spinTheta: 0,
        spinSign: 1,
        cy: 0,
        cz: 0,
        sy: 1e-3,
        sz: 1e-3,
        vy: 0,
        vz: 0,
        ph: 0,
      },
      {
        aRe: Math.SQRT1_2,
        aIm: 0,
        cohId: 'mix-B',
        spinTheta: Math.PI / 2,
        spinSign: -1,
        cy: 0,
        cz: 0,
        sy: 1e-3,
        sz: 1e-3,
        vy: 0,
        vz: 0,
        ph: Math.PI / 2,
      },
    ])
    const N = 40000
    const hits = sampleScreenHits(q, 0, N, 777, 0)
    let up = 0
    for (let i = 0; i < N; i++) if (hits.signs[i] > 0) up++
    const pUp = up / N
    expect(Math.abs(pUp - 0.75)).toBeLessThan(0.01)
  })

  it('interferometer: port fractions follow ½(1 − sinφ) for co-located orthogonal spinors', () => {
    // Independent analytic reference: Ψ = √½ ψ (χ_90,+ + e^{iφ} χ_90,−);
    // measurement along z: P(+) = ½(1 − sinφ).
    const fraction = (phiDeg: number) => {
      const phi = (phiDeg * Math.PI) / 180
      const q = makeEnvelope([
        {
          aRe: Math.SQRT1_2,
          aIm: 0,
          cohId: 'g',
          spinTheta: Math.PI / 2,
          spinSign: 1,
          cy: 0,
          cz: 0,
          sy: 1e-3,
          sz: 1e-3,
          vy: 0,
          vz: 0,
          ph: 0,
        },
        {
          aRe: Math.SQRT1_2,
          aIm: 0,
          cohId: 'g',
          spinTheta: Math.PI / 2,
          spinSign: -1,
          cy: 0,
          cz: 0,
          sy: 1e-3,
          sz: 1e-3,
          vy: 0,
          vz: 0,
          ph: phi,
        },
      ])
      const N = 40000
      const hits = sampleScreenHits(q, 0, N, 4242, 0)
      let up = 0
      for (let i = 0; i < N; i++) if (hits.signs[i] > 0) up++
      return up / N
    }
    for (const deg of [0, 30, 90, 180, 270]) {
      const expected = 0.5 * (1 - Math.sin((deg * Math.PI) / 180))
      const got = fraction(deg)
      expect(Math.abs(got - expected)).toBeLessThan(0.02)
    }
  })

  it('total phase of the whole state does not change sampled statistics', () => {
    const mk = (globalPh: number) =>
      makeEnvelope([
        {
          aRe: Math.SQRT1_2,
          aIm: 0,
          cohId: 'g',
          spinTheta: 0,
          spinSign: 1,
          cy: -2e-4,
          cz: 0,
          sy: 1e-3,
          sz: 1e-3,
          vy: 0,
          vz: 0,
          ph: globalPh,
        },
        {
          aRe: 0,
          aIm: Math.SQRT1_2,
          cohId: 'g',
          spinTheta: 0,
          spinSign: 1,
          cy: 2e-4,
          cz: 0,
          sy: 1e-3,
          sz: 1e-3,
          vy: 0,
          vz: 0,
          ph: globalPh + 1.1,
        },
      ])
    const stats = (q: QuantumEnvelope, seed: number) => {
      const N = 20000
      const hits = sampleScreenHits(q, 0, N, seed, 0)
      let my = 0
      let up = 0
      for (let i = 0; i < N; i++) {
        my += hits.ys[i]
        if (hits.signs[i] > 0) up++
      }
      return { my: my / N, up: up / N }
    }
    const a = stats(mk(0), 99)
    const b = stats(mk(2.3), 99)
    expect(Math.abs(a.my - b.my)).toBeLessThan(0.002)
    expect(Math.abs(a.up - b.up)).toBeLessThan(0.004)
  })
})
