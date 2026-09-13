import { describe, expect, it } from 'vitest'
import { runSimulation } from '../engine'
import type { Apparatus, SimulationConfig } from '../types'

function apparatus(partial: Partial<Apparatus> = {}): Apparatus {
  return {
    id: 'a' + Math.random().toString(36).slice(2, 7),
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
    apparatuses: [apparatus()],
    screenX: 0.6,
    particleCount: 4000,
    heroCount: 100,
    seed: 42,
    ...partial,
  }
}

describe('semiclassical single apparatus', () => {
  it('splits into exactly two spots', () => {
    const r = runSimulation(config())
    const zs: number[] = []
    for (let i = 0; i < r.nParticles; i++) {
      if (!r.absorbed[i]) zs.push(r.hitZ[i])
    }
    expect(zs.length).toBeGreaterThan(3800)
    const ups = zs.filter((z) => z > 0.002)
    const downs = zs.filter((z) => z < -0.002)
    const middle = zs.length - ups.length - downs.length
    // clear separation: almost nothing near zero, two symmetric groups
    expect(middle / zs.length).toBeLessThan(0.02)
    expect(Math.abs(ups.length - downs.length) / zs.length).toBeLessThan(0.05)
    // symmetric deflection
    const meanUp = ups.reduce((a, b) => a + b, 0) / ups.length
    const meanDown = downs.reduce((a, b) => a + b, 0) / downs.length
    expect(Math.abs(meanUp + meanDown)).toBeLessThan(0.02 * Math.abs(meanUp))
  })

  it('split distance matches analytic formula within 10%', () => {
    const cfg = config()
    const r = runSimulation(cfg)
    const app = cfg.apparatuses[0]
    const ups: number[] = []
    for (let i = 0; i < r.nParticles; i++) {
      if (!r.absorbed[i] && r.hitZ[i] > 0) ups.push(r.hitZ[i])
    }
    const meanZ = ups.reduce((a, b) => a + b, 0) / ups.length
    const v = cfg.source.vMean
    const tMagnet = app.length / v
    const tDrift = (cfg.screenX - app.xStart - app.length) / v
    const a = (9.2740100783e-24 * app.gradient) / 1.7915e-25
    const analytic = 0.5 * a * tMagnet * tMagnet + a * tMagnet * tDrift
    expect(Math.abs(meanZ - analytic) / analytic).toBeLessThan(0.1)
  })
})

describe('classical mode', () => {
  it('produces a continuous band, not two spots', () => {
    const r = runSimulation(config({ mode: 'classical' }))
    const zs: number[] = []
    for (let i = 0; i < r.nParticles; i++) {
      if (!r.absorbed[i]) zs.push(r.hitZ[i])
    }
    const near = zs.filter((z) => Math.abs(z) < 0.004).length
    // continuous distribution must populate the center
    expect(near / zs.length).toBeGreaterThan(0.05)
    // and overall spread is significant
    const std = Math.sqrt(zs.reduce((a, b) => a + b * b, 0) / zs.length)
    expect(std).toBeGreaterThan(0.005)
  })

  it('blocker cuts the blocked half of the classical beam', () => {
    const app = apparatus({ blockedPort: 'up' })
    const r = runSimulation(config({ mode: 'classical', apparatuses: [app] }))
    const plain = runSimulation(config({ mode: 'classical', apparatuses: [apparatus()] }))
    let absorbed = 0
    const zs: number[] = []
    for (let i = 0; i < r.nParticles; i++) {
      if (r.absorbed[i]) absorbed++
      else zs.push(r.hitZ[i])
    }
    // roughly half of the beam is deflected to the blocked side
    expect(absorbed / r.nParticles).toBeGreaterThan(0.4)
    expect(absorbed / r.nParticles).toBeLessThan(0.6)
    expect(zs.length).toBeGreaterThan(1500)
    // survivors are shifted down: the upper exit half is gone
    const mean = zs.reduce((a, b) => a + b, 0) / zs.length
    expect(mean).toBeLessThan(-0.001)
    // the top of the landing band is cut off compared to the unblocked run
    const plainZs: number[] = []
    for (let i = 0; i < plain.nParticles; i++) plainZs.push(plain.hitZ[i])
    expect(Math.max(...zs)).toBeLessThan(Math.max(...plainZs) - 0.002)
    // the band is still continuous (center populated)
    const near = zs.filter((z) => Math.abs(z) < 0.004).length
    expect(near / zs.length).toBeGreaterThan(0.05)
  })
})

describe('cascade with beam routing', () => {
  it('routed apparatus only sees particles from its branch', () => {
    const first = apparatus({ xStart: 0.2 })
    const second = apparatus({ xStart: 0.44, angleDeg: 90, attachTo: `${first.id}:down` })
    const r = runSimulation(config({ apparatuses: [first, second], screenX: 0.78 }))
    let fromUp = 0
    let fromDown = 0
    for (let i = 0; i < r.nParticles; i++) {
      if (r.absorbed[i]) continue
      if (r.history[i * 2] === 255) continue
      if (r.history[i * 2 + 1] !== 255) {
        // measured by the second apparatus -> must have come from the down branch
        if (r.history[i * 2] === 0) fromDown++
        else fromUp++
      }
    }
    expect(fromUp).toBe(0)
    expect(fromDown).toBeGreaterThan(1800)
  })

  it('two routed children at 90° give four equal branches', () => {
    const first = apparatus({ xStart: 0.18 })
    const upChild = apparatus({ xStart: 0.42, angleDeg: 90, attachTo: `${first.id}:up` })
    const downChild = apparatus({ xStart: 0.42, angleDeg: 90, attachTo: `${first.id}:down` })
    const r = runSimulation(
      config({ apparatuses: [first, upChild, downChild], screenX: 0.78, particleCount: 8000 }),
    )
    const counts = new Map<string, number>()
    for (let i = 0; i < r.nParticles; i++) {
      if (r.absorbed[i]) continue
      const h = `${r.history[i * 3]}|${r.history[i * 3 + 1]}|${r.history[i * 3 + 2]}`
      counts.set(h, (counts.get(h) ?? 0) + 1)
    }
    // histories: 0|0|255, 0|1|255 (down->downChild), 1|255|0, 1|255|1 (up->upChild)
    expect(counts.size).toBe(4)
    const total = [...counts.values()].reduce((a, b) => a + b, 0)
    for (const c of counts.values()) {
      expect(c / total).toBeGreaterThan(0.2)
      expect(c / total).toBeLessThan(0.3)
    }
  })

  it('probabilities follow cos²(θ/2) for a 60° child on the up branch', () => {
    const first = apparatus({ xStart: 0.2 })
    const second = apparatus({ xStart: 0.44, angleDeg: 60, attachTo: `${first.id}:up` })
    const r = runSimulation(
      config({ apparatuses: [first, second], screenX: 0.78, particleCount: 12000 }),
    )
    let up = 0
    let down = 0
    for (let i = 0; i < r.nParticles; i++) {
      if (r.absorbed[i]) continue
      // spin prepared +z by the first apparatus (up branch)
      if (r.history[i * 2] !== 1) continue
      if (r.history[i * 2 + 1] === 1) up++
      else down++
    }
    const frac = up / (up + down)
    // theory: 0.75 with statistical tolerance for 12000 samples
    expect(Math.abs(frac - 0.75)).toBeLessThan(0.02)
  })

  it('routed magnet deflects its branch off the axis (screen hit offset)', () => {
    const first = apparatus({ xStart: 0.2 })
    const second = apparatus({ xStart: 0.44, attachTo: `${first.id}:up` })
    const r = runSimulation(config({ apparatuses: [first, second], screenX: 0.78 }))
    let maxZ = 0
    for (let i = 0; i < r.nParticles; i++) {
      if (!r.absorbed[i] && r.history[i * 2] === 1 && r.history[i * 2 + 1] === 1) {
        if (r.hitZ[i] > maxZ) maxZ = r.hitZ[i]
      }
    }
    // double deflection: both magnets pushed the particle up
    expect(maxZ).toBeGreaterThan(0.03)
  })

  it('blocked port removes corresponding branch', () => {
    const r = runSimulation(config({ apparatuses: [apparatus({ blockedPort: 'down' })] }))
    let up = 0
    for (let i = 0; i < r.nParticles; i++) {
      if (r.absorbed[i]) continue
      if (r.history[i] === 0) throw new Error('down branch must be blocked')
      up++
    }
    expect(up / r.nParticles).toBeGreaterThan(0.4)
    expect(up / r.nParticles).toBeLessThan(0.6)
    const absorbedCount = [...r.absorbed].filter((x) => x === 1).length
    expect(absorbedCount / r.nParticles).toBeGreaterThan(0.4)
  })
})

describe('determinism', () => {
  it('same seed reproduces results', () => {
    const a = runSimulation(config())
    const b = runSimulation(config())
    expect([...a.hitZ]).toEqual([...b.hitZ])
  })
})
