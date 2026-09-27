import { describe, expect, it } from 'vitest'
import {
  simulateQuantum,
  evalRho,
  evalProfile,
  evalAxisProfile,
  sampleScreenHits,
  spinor,
  spinOverlap,
} from '../quantum'
import { screenFrame, toScreenFrame } from '../beams'
import type { Apparatus, SimulationConfig } from '../types'

function apparatus(partial: Partial<Apparatus> = {}): Apparatus {
  return {
    id: 'q' + Math.random().toString(36).slice(2, 7),
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
    mode: 'quantum',
    source: { vMean: 500, vSigma: 30, aperture: 0.0005, divergence: 0.001 },
    apparatuses: [apparatus()],
    screenX: 0.6,
    particleCount: 1000,
    heroCount: 100,
    seed: 42,
    ...partial,
  }
}

describe('quantum branches', () => {
  it('single apparatus: two branches with weights 1/2', () => {
    const q = simulateQuantum(config())
    expect(q.branches).toHaveLength(2)
    const total = q.branches.reduce((a, b) => a + b.weight, 0)
    expect(total).toBeCloseTo(1, 6)
    for (const b of q.branches) {
      expect(b.weight).toBeCloseTo(0.5, 6)
    }
  })

  it('cascade: child on the up branch splits only that branch (45°)', () => {
    const first = apparatus({ xStart: 0.2 })
    const second = apparatus({ xStart: 0.44, angleDeg: 45, attachTo: `${first.id}:up` })
    const q = simulateQuantum(config({ apparatuses: [first, second], screenX: 0.78 }))
    expect(q.branches).toHaveLength(3)
    const total = q.branches.reduce((a, b) => a + b.weight, 0)
    expect(total).toBeCloseTo(1, 6)
    // weights: down (untouched) 0.5; up splits into 0.5*cos²(22.5°), 0.5*sin²(22.5°)
    const w = q.branches.map((b) => b.weight).sort((a, b) => b - a)
    const c = Math.cos(Math.PI / 8) ** 2
    expect(w[0]).toBeCloseTo(0.5, 4)
    expect(w[1]).toBeCloseTo(0.5 * c, 4)
    expect(w[2]).toBeCloseTo(0.5 * (1 - c), 4)
  })

  it('blocked port removes the branch', () => {
    const q = simulateQuantum(config({ apparatuses: [apparatus({ blockedPort: 'down' })] }))
    expect(q.branches).toHaveLength(1)
    expect(q.branches[0].spinSign).toBe(1)
    expect(q.branches[0].weight).toBeCloseTo(0.5, 6)
  })

  it('branches separate spatially after the magnet (two-lobe rho)', () => {
    const cfg = config()
    const q = simulateQuantum(cfg)
    const tScreen = cfg.screenX / cfg.source.vMean
    const screenX = cfg.screenX
    const upAt = evalRho(q, screenX, 0.01, tScreen).rho
    const midAt = evalRho(q, screenX, 0.0, tScreen).rho
    expect(upAt).toBeGreaterThan(5 * midAt)
  })

  it('z-slices integrate to the correct Gaussian marginal (normalization)', () => {
    const cfg = config()
    const q = simulateQuantum(cfg)
    const { header } = q
    for (const t of [0, header.tTotal / 3, header.tTotal]) {
      const f = Math.min(header.frameCount - 1.001, Math.max(0, t / header.timePerFrame))
      const i0 = Math.floor(f)
      const frac = f - i0
      for (const off of [-0.7, 0.9]) {
        const b0 = q.branches[0]
        const cx = b0.cx[i0] + (b0.cx[i0 + 1] - b0.cx[i0]) * frac
        const sx = b0.sx[i0] + (b0.sx[i0 + 1] - b0.sx[i0]) * frac
        const x = cx + off * sx
        // integrate rho over z with a fine grid (sigma_z aware)
        const dz = 2e-5
        let s = 0
        for (let z = -0.02; z <= 0.02; z += dz) {
          s += evalRho(q, x, z, t).rho * dz
        }
        // expected marginal: sum of w * N(x; cx, sx)
        let expected = 0
        for (const b of q.branches) {
          const cx = b.cx[i0] + (b.cx[i0 + 1] - b.cx[i0]) * frac
          const sx = b.sx[i0] + (b.sx[i0 + 1] - b.sx[i0]) * frac
          expected += (b.weight * Math.exp(-((x - cx) ** 2) / (2 * sx * sx))) / (Math.sqrt(2 * Math.PI) * sx)
        }
        expect(Math.abs(s - expected) / expected).toBeLessThan(0.02)
      }
    }
  })

  it('evalProfile peaks near analytic deflection', () => {
    const cfg = config()
    const q = simulateQuantum(cfg)
    const app = cfg.apparatuses[0]
    const v = cfg.source.vMean
    const tMag = app.length / v
    const tDrift = (cfg.screenX - app.xStart - app.length) / v
    const a = (9.2740100783e-24 * app.gradient) / 1.7915e-25
    const zTheory = 0.5 * a * tMag * tMag + a * tMag * tDrift
    // find profile peak
    let bestZ = 0
    let best = -1
    for (let i = -40; i <= 40; i++) {
      const z = (i / 40) * 0.04
      const p = evalProfile(q, cfg.screenX, cfg.screenX / v, z)
      if (p > best) {
        best = p
        bestZ = z
      }
    }
    // two symmetric peaks; the scan finds one of them
    expect(Math.abs(Math.abs(bestZ) - zTheory)).toBeLessThan(0.004)
  })
})

describe('quantum screen hits', () => {
  it('samples a bimodal deposition matching the split', () => {
    const cfg = config()
    const q = simulateQuantum(cfg)
    const hits = sampleScreenHits(q, cfg.screenX, 8000, 7)
    expect(hits.times.length).toBe(8000)
    for (let i = 1; i < 8000; i++) expect(hits.times[i]).toBeGreaterThanOrEqual(hits.times[i - 1])
    expect(hits.times[0]).toBeGreaterThanOrEqual(0)
    expect(hits.times[7999]).toBeLessThanOrEqual(q.header.tTotal)
    const a = (9.2740100783e-24 * cfg.apparatuses[0].gradient) / 1.7915e-25
    const v = cfg.source.vMean
    const tMag = cfg.apparatuses[0].length / v
    const tDrift = (cfg.screenX - cfg.apparatuses[0].xStart - cfg.apparatuses[0].length) / v
    const zTheory = 0.5 * a * tMag * tMag + a * tMag * tDrift
    let up = 0
    let down = 0
    let middle = 0
    for (let i = 0; i < 8000; i++) {
      if (hits.zs[i] > zTheory * 0.5) up++
      else if (hits.zs[i] < -zTheory * 0.5) down++
      else middle++
    }
    expect(up / 8000).toBeGreaterThan(0.35)
    expect(down / 8000).toBeGreaterThan(0.35)
    expect(middle / 8000).toBeLessThan(0.15)
    let agree = 0
    for (let i = 0; i < 8000; i++) if (Math.sign(hits.zs[i]) === hits.signs[i]) agree++
    expect(agree / 8000).toBeGreaterThan(0.95)
  })

  it('is deterministic for a fixed seed', () => {
    const cfg = config()
    const q = simulateQuantum(cfg)
    const a = sampleScreenHits(q, cfg.screenX, 500, 11)
    const b = sampleScreenHits(q, cfg.screenX, 500, 11)
    expect([...a.zs]).toEqual([...b.zs])
    expect([...a.times]).toEqual([...b.times])
  })
})

describe('quantum rotated detector', () => {
  it('90° detector splits along world Y; screen frame sees symmetric ±s', () => {
    const app = apparatus({ angleDeg: 90 })
    const cfg = config({ apparatuses: [app] })
    const q = simulateQuantum(cfg)
    const v = cfg.source.vMean
    const f = screenFrame(cfg.apparatuses, v)
    expect(f.theta).toBeCloseTo(Math.PI / 2)
    const fr = q.header.frameCount - 1
    const tEnd = fr * q.header.timePerFrame
    // analytic deflection along the apparatus axis at the last frame
    const a = (9.2740100783e-24 * app.gradient) / 1.7915e-25
    const tEnt = (app.xStart - 0.05) / v
    const tExit = (app.xStart + app.length - 0.05) / v
    const tau = tExit - tEnt
    const sTheory = a * (0.5 * tau * tau + tau * (tEnd - tExit))
    const ss = q.branches
      .map((b) => (b.cy[fr] - f.cy) * f.ny + (b.cz[fr] - f.cz) * f.nz)
      .sort((x, y) => y - x)
    expect(ss[0]).toBeCloseTo(sTheory, 3)
    expect(ss[1]).toBeCloseTo(-sTheory, 3)
    // world-z centers stay on the beam axis: the split went into Y
    for (const b of q.branches) expect(Math.abs(b.cz[fr])).toBeLessThan(1e-9)
  })

  it('screen hits deposit along the rotated axis (sign agrees with frame s)', () => {
    const app = apparatus({ angleDeg: 90 })
    const cfg = config({ apparatuses: [app] })
    const q = simulateQuantum(cfg)
    const f = screenFrame(cfg.apparatuses, cfg.source.vMean)
    const hits = sampleScreenHits(q, cfg.screenX, 4000, 5, f.theta)
    let agree = 0
    for (let i = 0; i < 4000; i++) {
      const { s } = toScreenFrame(f, hits.ys[i], hits.zs[i])
      if (Math.sign(s) === hits.signs[i]) agree++
    }
    expect(agree / 4000).toBeGreaterThan(0.95)
    // world-z marginal is single-lobe; axis profile is bimodal
    const tq = cfg.screenX / cfg.source.vMean
    const axis = Math.max(
      evalAxisProfile(q, cfg.screenX, tq, f, 0.012),
      evalAxisProfile(q, cfg.screenX, tq, f, -0.012),
    )
    const axisMid = evalAxisProfile(q, cfg.screenX, tq, f, 0)
    expect(axis).toBeGreaterThan(5 * axisMid)
  })
})

describe('quantum coherence (spinors, phases, recombiner)', () => {
  it('spinors are normalized, orthogonal within an axis, project as cos²(Δ/2)', () => {
    for (const deg of [0, 37, 90, 200, 359]) {
      const th = (deg * Math.PI) / 180
      const pp = spinOverlap(th, 1, th, 1)
      expect(Math.hypot(pp.re, pp.im)).toBeCloseTo(1, 12)
      const pm = spinOverlap(th, 1, th, -1)
      expect(Math.hypot(pm.re, pm.im)).toBeCloseTo(0, 12)
    }
    // |⟨χ_0,+|χ_θ,+⟩|² = cos²(θ/2)
    for (const deg of [0, 30, 45, 90, 170]) {
      const th = (deg * Math.PI) / 180
      const so = spinOverlap(0, 1, th, 1)
      expect(Math.hypot(so.re, so.im) ** 2).toBeCloseTo(Math.cos(th / 2) ** 2, 12)
      const sm = spinOverlap(0, 1, th, -1)
      expect(Math.hypot(sm.re, sm.im) ** 2).toBeCloseTo(Math.sin(th / 2) ** 2, 12)
    }
  })

  it('spinor components: |χ|² per component sums to 1', () => {
    for (const deg of [0, 45, 90, 270]) {
      for (const s of [1, -1]) {
        const c = spinor((deg * Math.PI) / 180, s)
        const norm = c[0] ** 2 + c[1] ** 2 + c[2] ** 2 + c[3] ** 2
        expect(norm).toBeCloseTo(1, 12)
      }
    }
  })

  it('down branch at a tilted analyzer gets sign-correct probabilities', () => {
    // spin −z meets a 45° analyzer: P(up) = sin²(22.5°) — the old theta-only
    // formula inverted this
    const first = apparatus({ xStart: 0.2, blockedPort: 'up' }) // only −z survives
    const second = apparatus({ xStart: 0.44, angleDeg: 45, attachTo: `${first.id}:down` })
    const q = simulateQuantum(config({ apparatuses: [first, second], screenX: 0.78 }))
    expect(q.branches).toHaveLength(2)
    const wUp = q.branches.filter((b) => b.spinSign > 0).reduce((a, b) => a + b.weight, 0)
    const wDown = q.branches.filter((b) => b.spinSign < 0).reduce((a, b) => a + b.weight, 0)
    expect(wUp).toBeCloseTo(0.5 * Math.sin(Math.PI / 8) ** 2, 4)
    expect(wDown).toBeCloseTo(0.5 * Math.cos(Math.PI / 8) ** 2, 4)
  })

  it('magnet splits a pure branch coherently; mixed root stays incoherent', () => {
    const filter = apparatus({ xStart: 0.2, blockedPort: 'down' })
    const mag = apparatus({ xStart: 0.44, angleDeg: 45, attachTo: `${filter.id}:up`, kind: 'magnet' })
    const q = simulateQuantum(config({ apparatuses: [filter, mag], screenX: 0.78 }))
    expect(q.branches).toHaveLength(2)
    expect(new Set(q.branches.map((b) => b.cohId)).size).toBe(1)
    const total = q.branches.reduce((a, b) => a + b.weight, 0)
    expect(total).toBeCloseTo(0.5, 6)
    const w = q.branches.map((b) => b.weight).sort((a, b) => b - a)
    expect(w[0]).toBeCloseTo(0.5 * Math.cos(Math.PI / 8) ** 2, 4)
    expect(w[1]).toBeCloseTo(0.5 * Math.sin(Math.PI / 8) ** 2, 4)

    // unpolarized root through a magnet: mixed state, incoherent halves
    const magRoot = apparatus({ xStart: 0.25, kind: 'magnet' })
    const q2 = simulateQuantum(config({ apparatuses: [magRoot] }))
    expect(new Set(q2.branches.map((b) => b.cohId)).size).toBe(2)
    for (const b of q2.branches) expect(b.weight).toBeCloseTo(0.5, 6)
  })

  it('recombiner returns the coherent pair to a common axis (position & velocity)', () => {
    const filter = apparatus({ xStart: 0.18, blockedPort: 'down', gradient: 300 })
    const splitter = apparatus({ xStart: 0.4, angleDeg: 90, attachTo: `${filter.id}:up`, kind: 'magnet' })
    const rec = apparatus({
      xStart: 0.56,
      angleDeg: 90,
      length: 0.36,
      gradient: 2000,
      attachTo: `${splitter.id}:up`,
      kind: 'recombiner',
    })
    const q = simulateQuantum(config({ apparatuses: [filter, splitter, rec], screenX: 1.0 }))
    expect(q.branches).toHaveLength(2)
    expect(new Set(q.branches.map((b) => b.cohId)).size).toBe(1)
    const fr = q.header.frameCount - 1
    const [b1, b2] = q.branches
    expect(Math.abs(b1.cy[fr] - b2.cy[fr])).toBeLessThan(1e-6)
    expect(Math.abs(b1.cz[fr] - b2.cz[fr])).toBeLessThan(1e-6)
    expect(Math.abs(b1.vy[fr] - b2.vy[fr])).toBeLessThan(1e-3)
    expect(Math.abs(b1.vz[fr] - b2.vz[fr])).toBeLessThan(1e-3)
    // relative phase is reported
    expect(q.interferometerPhases).toHaveLength(1)
    expect(q.interferometerPhases[0].deltaPhase).toBeGreaterThanOrEqual(0)
    expect(q.interferometerPhases[0].deltaPhase).toBeLessThan(2 * Math.PI)
  })

  it('interferometer: final analyzer port fraction oscillates with the phase knob', () => {
    const baseApparatus = () => {
      const filter = apparatus({ xStart: 0.18, blockedPort: 'down', gradient: 300 })
      const splitter = apparatus({ xStart: 0.4, angleDeg: 90, attachTo: `${filter.id}:up`, kind: 'magnet' })
      const rec = (phase: number) =>
        apparatus({
          xStart: 0.56,
          angleDeg: 90,
          length: 0.36,
          gradient: 2000,
          attachTo: `${splitter.id}:up`,
          kind: 'recombiner',
          phaseShiftDeg: phase,
        })
      const analyzer = apparatus({ xStart: 0.96, angleDeg: 0, attachTo: `${splitter.id}:merged` })
      return { filter, splitter, rec, analyzer }
    }
    const fraction = (phase: number) => {
      const { filter, splitter, rec, analyzer } = baseApparatus()
      const cfg = config({
        apparatuses: [filter, splitter, rec(phase), analyzer],
        screenX: 1.15,
      })
      const q = simulateQuantum(cfg)
      const hits = sampleScreenHits(q, cfg.screenX, 6000, 7, 0)
      let up = 0
      for (let i = 0; i < hits.signs.length; i++) if (hits.signs[i] > 0) up++
      return up / hits.signs.length
    }
    const f0 = fraction(0)
    const f90 = fraction(90)
    const f180 = fraction(180)
    const f270 = fraction(270)
    // complementary pairs sum to 1 (probability conservation)
    expect(Math.abs(f0 + f180 - 1)).toBeLessThan(0.05)
    expect(Math.abs(f90 + f270 - 1)).toBeLessThan(0.05)
    // strong oscillation across the phase scan (visibility near 1)
    expect(Math.abs(f0 - f180) + Math.abs(f90 - f270)).toBeGreaterThan(1.2)
  })

  it('blocking a port between splitter and recombiner kills the interference pair', () => {
    const filter = apparatus({ xStart: 0.18, blockedPort: 'down', gradient: 300 })
    const splitter = apparatus({ xStart: 0.4, angleDeg: 90, attachTo: `${filter.id}:up`, kind: 'magnet' })
    const rec = apparatus({
      xStart: 0.56,
      angleDeg: 90,
      length: 0.36,
      gradient: 2000,
      attachTo: `${splitter.id}:up`,
      kind: 'recombiner',
      blockedPort: 'down',
    })
    const q = simulateQuantum(config({ apparatuses: [filter, splitter, rec], screenX: 1.0 }))
    // the down member is absorbed at the recombiner plate — no pair remains
    expect(q.branches).toHaveLength(1)
    expect(q.interferometerPhases).toHaveLength(0)
  })
})
