import { describe, expect, it } from 'vitest'
import { runBell, quantumS, HENSEN_ANGLES, type BellConfig } from '../bell'

function cfg(partial: Partial<BellConfig> = {}): BellConfig {
  return { ...HENSEN_ANGLES, ...partial }
}

describe('quantum model', () => {
  it('violates CHSH: S ≈ 2√2 at Hensen angles', () => {
    const r = runBell(cfg({ pairs: 50000 }))
    expect(r.trials).toBeGreaterThan(40000)
    expect(Math.abs(r.S - 2 * Math.SQRT2)).toBeLessThan(0.05)
  })

  it('matches theoretical S(angles, V)', () => {
    const c = cfg({ pairs: 40000, anglesB: [-120, 130], visibility: 0.9 })
    const r = runBell(c)
    expect(Math.abs(r.S - quantumS(c.anglesA, c.anglesB, 0.9))).toBeLessThan(0.06)
  })

  it('perfect anti-correlation at equal angles', () => {
    const r = runBell(cfg({ pairs: 20000, anglesA: [30, 30], anglesB: [30, 30] }))
    // all four combos identical: E = -1
    expect(r.E[0][0]).toBeLessThan(-0.99)
  })

  it('correlation follows -cos(Δ)', () => {
    const r = runBell(cfg({ pairs: 40000, anglesA: [0, 0], anglesB: [60, 120] }))
    // E[a][b] uses anglesA[a] vs anglesB[b]
    expect(Math.abs(r.E[0][0] + Math.cos((60 * Math.PI) / 180))).toBeLessThan(0.05)
    expect(Math.abs(r.E[0][1] + Math.cos((120 * Math.PI) / 180))).toBeLessThan(0.05)
  })
})

describe('local hidden variables', () => {
  it('saturates but never exceeds the bound in expectation (Hensen angles)', () => {
    // finite-sample Ŝ fluctuates ~±0.01 around the LHV bound 2;
    // check individual runs stay close and the mean across seeds ≤ 2
    const Ss = [1, 7, 42, 100, 999].map((seed) =>
      runBell(cfg({ model: 'local', pairs: 40000, seed })).S,
    )
    for (const s of Ss) expect(s).toBeLessThanOrEqual(2.05)
    const mean = Ss.reduce((a, b) => a + b, 0) / Ss.length
    expect(mean).toBeLessThanOrEqual(2.01)
  })

  it('never violates S ≤ 2 over a sweep of angles (on average)', () => {
    for (let k = 0; k < 6; k++) {
      const r = runBell(
        cfg({
          model: 'local',
          pairs: 15000,
          seed: 100 + k,
          anglesA: [k * 23, 90 + k * 11],
          anglesB: [-135 + k * 17, 135 - k * 7],
        }),
      )
      expect(r.S).toBeLessThanOrEqual(2.08)
    }
  })
})

describe('loopholes', () => {
  it('detection efficiency scales valid trials (~η²)', () => {
    const r = runBell(cfg({ pairs: 20000, detectionEff: 0.5 }))
    expect(r.trials / 20000).toBeGreaterThan(0.22)
    expect(r.trials / 20000).toBeLessThan(0.28)
    // undetected pairs are excluded from statistics
    let bothDetected = 0
    for (let i = 0; i < r.nPairs; i++) {
      if (r.outcomeA[i] !== 0 && r.outcomeB[i] !== 0) bothDetected++
    }
    expect(bothDetected).toBe(r.trials)
  })

  it('low visibility kills the violation', () => {
    const r = runBell(cfg({ pairs: 40000, visibility: 0.6 }))
    // V=0.6 → S ≈ 0.6·2√2 ≈ 1.7 < 2
    expect(r.S).toBeLessThan(2)
  })
})

describe('determinism', () => {
  it('same seed reproduces', () => {
    const a = runBell(cfg({ pairs: 5000 }))
    const b = runBell(cfg({ pairs: 5000 }))
    expect([...a.outcomeA]).toEqual([...b.outcomeA])
    expect(a.S).toBe(b.S)
  })
})
