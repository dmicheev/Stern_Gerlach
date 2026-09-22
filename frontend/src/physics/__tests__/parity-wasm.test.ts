import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { runSimulation } from '../engine'
import { parseWasmResult } from '../wasm'
import type { SimulationConfig, SimResult } from '../types'
import type { Apparatus } from '../types'

/**
 * JS <-> WASM parity: for the same config and seed the TypeScript reference
 * engine and the Rust/WASM engine must produce identical output. This is the
 * project invariant that makes it safe to change the Rust side — if this test
 * fails after a Rust edit, the WASM binary is stale or the implementations
 * diverged.
 */

const wasmPath = join(dirname(fileURLToPath(import.meta.url)), '../wasm-pkg/sg_physics_bg.wasm')

interface WasmGlue {
  run_simulation(configJson: string): Uint8Array
  initSync(module: WebAssembly.Module): unknown
}

async function loadWasmRunner(): Promise<((cfg: SimulationConfig) => SimResult) | null> {
  if (!existsSync(wasmPath)) return null
  const mod = (await import('../wasm-pkg/sg_physics.js')) as unknown as WasmGlue
  if (typeof mod.run_simulation !== 'function' || typeof mod.initSync !== 'function') return null
  mod.initSync(new WebAssembly.Module(new Uint8Array(readFileSync(wasmPath))))
  return (cfg) => {
    const u8 = mod.run_simulation(JSON.stringify(cfg))
    return parseWasmResult(u8.buffer as ArrayBuffer, u8.byteOffset)
  }
}

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
    particleCount: 2000,
    heroCount: 40,
    seed: 42,
    ...partial,
  }
}

const cases: { name: string; cfg: SimulationConfig }[] = [
  { name: 'semiclassical, single apparatus', cfg: config() },
  { name: 'classical, single apparatus', cfg: config({ mode: 'classical' }) },
  {
    name: 'cascade 90° child on down branch',
    cfg: config({
      apparatuses: [apparatus('sg1', { xStart: 0.2 }), apparatus('sg2', { xStart: 0.44, angleDeg: 90, attachTo: 'sg1:down' })],
      screenX: 0.78,
      seed: 7,
    }),
  },
  {
    name: 'cascade with blocked port',
    cfg: config({
      mode: 'classical',
      apparatuses: [apparatus('sg1', { xStart: 0.2, blockedPort: 'up' }), apparatus('sg2', { xStart: 0.44, angleDeg: 45, attachTo: 'sg1:down' })],
      screenX: 0.78,
      seed: 123,
    }),
  },
  {
    name: 'three-45 cascade, hot source',
    cfg: config({
      apparatuses: [
        apparatus('sg1', { xStart: 0.18 }),
        apparatus('sg2', { xStart: 0.42, angleDeg: 45, attachTo: 'sg1:up' }),
        apparatus('sg3', { xStart: 0.66, angleDeg: 45, attachTo: 'sg2:up' }),
      ],
      screenX: 1.0,
      source: { vMean: 600, vSigma: 45, aperture: 0.0008, divergence: 0.0015 },
      seed: 99,
    }),
  },
]

const runWasm = await loadWasmRunner()

describe.skipIf(runWasm === null)('JS <-> WASM parity (same config + seed => same output)', () => {
  for (const { name, cfg } of cases) {
    it(name, () => {
      const js = runSimulation(cfg)
      const wasm = runWasm!(cfg)

      expect(wasm.nParticles).toBe(js.nParticles)
      expect(wasm.nHero).toBe(js.nHero)
      expect(wasm.nT).toBe(js.nT)
      expect(wasm.nApparatus).toBe(js.nApparatus)

      // integer arrays must match exactly (RNG draws, routing, blockers)
      const exactInt = (a: Int8Array | Uint8Array, b: Int8Array | Uint8Array) => {
        expect(a.length).toBe(b.length)
        for (let i = 0; i < a.length; i++) expect(a[i]).toBe(b[i])
      }
      exactInt(js.heroSpinSign, wasm.heroSpinSign)
      exactInt(js.spinSign, wasm.spinSign)
      exactInt(js.absorbed, wasm.absorbed)
      exactInt(js.history, wasm.history)

      // float arrays: same math in f64; allow last-ulp differences from libm
      const close = (a: Float64Array, b: Float64Array, tol = 1e-9) => {
        expect(a.length).toBe(b.length)
        for (let i = 0; i < a.length; i++) {
          const x = a[i]
          const y = b[i]
          if (Number.isNaN(x) || Number.isNaN(y)) {
            expect(Number.isNaN(x)).toBe(Number.isNaN(y))
            continue
          }
          if (x !== y) expect(Math.abs(x - y)).toBeLessThan(tol)
        }
      }
      close(js.heroPos, wasm.heroPos)
      close(js.heroSpinTheta, wasm.heroSpinTheta)
      close(js.heroBirth, wasm.heroBirth)
      close(js.heroSampleDt, wasm.heroSampleDt)
      close(js.hitTime, wasm.hitTime)
      close(js.hitY, wasm.hitY)
      close(js.hitZ, wasm.hitZ)
      close(js.spinTheta, wasm.spinTheta)
      close(Float64Array.of(js.tTotal), Float64Array.of(wasm.tTotal))
    })
  }
})
