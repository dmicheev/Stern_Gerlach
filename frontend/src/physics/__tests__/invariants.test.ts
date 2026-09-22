import { describe, expect, it } from 'vitest'
import { runSimulation } from '../engine'
import { simulateQuantum } from '../quantum'
import type { Apparatus, SimulationConfig } from '../types'

/**
 * Physical invariants of the cascade models:
 *  - normalization P(up) + P(down) = 1 at each SG without a blocker
 *  - full branch probability is conserved (kept + explicitly discarded = 1)
 *  - classical symmetric source lands symmetrically: <z> = 0
 *  - rotation invariance: the split follows the apparatus axis n(theta) for
 *    0 / 45 / 90 / 135 / 180 degrees, with no deflection along the perpendicular
 */

function apparatus(id: string, partial: Partial<Apparatus> = {}): Apparatus {
  return {
    id,
    attachTo: 'root',
    xStart: 0.25,
    length: 0.12,
    angleDeg: 0,
    gradient: 1500,
    b0: 0.5,
    gap: 0.006,
    blockedPort: null,
    ...partial,
  }
}

function config(partial: Partial<SimulationConfig> = {}): SimulationConfig {
  return {
    mode: 'semiclassical',
    source: { vMean: 500, vSigma: 30, aperture: 0.0005, divergence: 0.001 },
    apparatuses: [apparatus('sg1')],
    screenX: 0.6,
    particleCount: 6000,
    heroCount: 50,
    seed: 42,
    ...partial,
  }
}

describe('semiclassical normalization', () => {
  it('single SG without blocker: P(up) + P(down) = 1 (every particle measured)', () => {
    const r = runSimulation(config())
    let up = 0
    let down = 0
    for (let i = 0; i < r.nParticles; i++) {
      if (r.history[i] === 1) up++
      else if (r.history[i] === 0) down++
      else throw new Error('particle was not measured by the apparatus')
    }
    expect(up + down).toBe(r.nParticles)
    expect(up / r.nParticles).toBeGreaterThan(0.45)
    expect(up / r.nParticles).toBeLessThan(0.55)
  })

  it('cascade: screen + absorbed accounting covers every particle', () => {
    const first = apparatus('sg1', { xStart: 0.2 })
    const second = apparatus('sg2', { xStart: 0.44, angleDeg: 90, attachTo: 'sg1:up', blockedPort: 'down' })
    const r = runSimulation(config({ apparatuses: [first, second], screenX: 0.78 }))
    let onScreen = 0
    let absorbed = 0
    for (let i = 0; i < r.nParticles; i++) {
      if (r.absorbed[i]) absorbed++
      else onScreen++
    }
    expect(onScreen + absorbed).toBe(r.nParticles)
    // first apparatus splits 50/50; the up half loses its down part at 90°
    expect(absorbed / r.nParticles).toBeGreaterThan(0.2)
    expect(absorbed / r.nParticles).toBeLessThan(0.3)
  })
})

describe('quantum branch normalization', () => {
  it('weak branches survive the cutoff: kept + discarded = 1 exactly', () => {
    // alternating 170° -> 0° -> 170° chains attenuate one branch to ~3e-5,
    // below the old 1e-4 cutoff that silently broke normalization
    const a1 = apparatus('sg1', { xStart: 0.2 })
    const a2 = apparatus('sg2', { xStart: 0.44, angleDeg: 170, attachTo: 'sg1:up' })
    const a3 = apparatus('sg3', { xStart: 0.68, angleDeg: 0, attachTo: 'sg2:up' })
    const q = simulateQuantum(config({ mode: 'quantum', apparatuses: [a1, a2, a3], screenX: 0.95 }))
    const total = q.branches.reduce((a, b) => a + b.weight, 0)
    expect(total + q.discardedWeight).toBeCloseTo(1, 12)
    expect(q.discardedWeight).toBe(0)
    // the tiny branch (0.5 * cos^4(85°) ~ 2.9e-5) is still alive
    const minW = Math.min(...q.branches.map((b) => b.weight))
    expect(minW).toBeLessThan(1e-4)
    expect(minW).toBeGreaterThan(1e-6)
  })

  it('extreme cascade: discarded mass is reported, kept + discarded still = 1', () => {
    const a1 = apparatus('sg1', { xStart: 0.18 })
    const a2 = apparatus('sg2', { xStart: 0.4, angleDeg: 179, attachTo: 'sg1:up' })
    const a3 = apparatus('sg3', { xStart: 0.62, angleDeg: 0, attachTo: 'sg2:up' })
    const a4 = apparatus('sg4', { xStart: 0.84, angleDeg: 179, attachTo: 'sg3:up' })
    const q = simulateQuantum(config({ mode: 'quantum', apparatuses: [a1, a2, a3, a4], screenX: 1.05 }))
    const total = q.branches.reduce((a, b) => a + b.weight, 0)
    expect(q.discardedWeight).toBeGreaterThan(0)
    expect(total + q.discardedWeight).toBeCloseTo(1, 12)
  })
})

describe('classical symmetry', () => {
  it('symmetric unpolarized source: <z> = 0 on the screen', () => {
    const r = runSimulation(config({ mode: 'classical', particleCount: 8000 }))
    let s = 0
    let n = 0
    for (let i = 0; i < r.nParticles; i++) {
      if (r.absorbed[i]) continue
      s += r.hitZ[i]
      n++
    }
    expect(Math.abs(s / n)).toBeLessThan(0.0005) // < 0.5 mm for a ~3 mm band
  })
})

describe('rotation invariance of the split axis', () => {
  const v = 500
  const app0 = { xStart: 0.25, length: 0.12, gradient: 1500 }
  const tMagnet = app0.length / v
  const tDrift = (0.6 - app0.xStart - app0.length) / v
  const a = (9.2740100783e-24 * app0.gradient) / 1.7915e-25
  const dTheory = 0.5 * a * tMagnet * tMagnet + a * tMagnet * tDrift

  for (const deg of [0, 45, 90, 135, 180]) {
    it(`deflection follows n(${deg}°), perpendicular stays on axis`, () => {
      const app = apparatus('sg1', { angleDeg: deg })
      const r = runSimulation(config({ apparatuses: [app], particleCount: 4000 }))
      const th = (deg * Math.PI) / 180
      const ny = -Math.sin(th)
      const nz = Math.cos(th)
      let sumS = 0
      let count = 0
      let sumP = 0
      for (let i = 0; i < r.nParticles; i++) {
        if (r.absorbed[i] || r.spinSign[i] !== 1) continue // up branch only
        const s = r.hitY[i] * ny + r.hitZ[i] * nz // along the apparatus axis
        const p = r.hitY[i] * nz - r.hitZ[i] * ny // perpendicular, same handedness
        if (s <= 0) continue
        sumS += s
        sumP += p
        count++
      }
      expect(count).toBeGreaterThan(1500)
      // up-lobe center follows the analytic deflection for every rotation
      expect(Math.abs(sumS / count - dTheory) / dTheory).toBeLessThan(0.1)
      // no net displacement perpendicular to the apparatus axis
      expect(Math.abs(sumP / count)).toBeLessThan(0.0015)
    })
  }
})
