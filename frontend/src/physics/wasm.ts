import type { SimulationConfig, SimResult } from './types'

interface WasmGlue {
  run_simulation(configJson: string): Uint8Array
  default(init?: unknown): Promise<unknown>
}

/**
 * Binary layout shared with the Rust crate (sg-physics). All float64 arrays first,
 * then float32, then integer arrays. Header is ASCII JSON terminated by \0
 * followed by u32 array lengths in fixed order.
 *
 * [jsonHeaderLen: u32][jsonHeader bytes][payload...]
 * payload:
 *   f64 heroPos[nHero*nT*3]
 *   f64 heroSpinTheta[nHero*nT]
 *   f64 heroBirth[nHero]
 *   f64 heroSampleDt[nHero]
 *   f64 hitTime[n]
 *   f64 hitY[n]
 *   f64 hitZ[n]
 *   f64 spinTheta[n]
 *   f64 tTotal[1]
 *   i8  heroSpinSign[nHero*nT]
 *   i8  spinSign[n]
 *   u8  absorbed[n]
 *   u8  history[n*nApp]
 *
 * The arrays are returned as zero-copy TypedArray views over the payload
 * buffer (the Rust side pads the header to 8-byte alignment and emits all
 * f64 blocks first, so every view is naturally aligned). The only copy on
 * the path is the single wasm-bindgen copy out of linear memory. Views read
 * native endianness — the layout is little-endian, matching every supported
 * browser platform.
 */
export function parseWasmResult(buffer: ArrayBuffer, byteOffset = 0): SimResult {
  const dv = new DataView(buffer, byteOffset)
  const headerLen = dv.getUint32(0, true)
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, byteOffset + 4, headerLen))) as {
    nParticles: number
    nHero: number
    nT: number
    nApparatus: number
  }
  let off = (4 + headerLen + 7) & ~7

  const { nParticles: n, nHero, nT, nApparatus: nApp } = header
  const f64 = (len: number) => {
    const a = new Float64Array(buffer, byteOffset + off, len)
    off += len * 8
    return a
  }
  const i8 = (len: number) => {
    const a = new Int8Array(buffer, byteOffset + off, len)
    off += len
    return a
  }
  const u8 = (len: number) => {
    const a = new Uint8Array(buffer, byteOffset + off, len)
    off += len
    return a
  }

  const heroPos = f64(nHero * nT * 3)
  const heroSpinTheta = f64(nHero * nT)
  const heroBirth = f64(nHero)
  const heroSampleDt = f64(nHero)
  const hitTime = f64(n)
  const hitY = f64(n)
  const hitZ = f64(n)
  const spinTheta = f64(n)
  const tTotal = f64(1)[0]
  const heroSpinSign = i8(nHero * nT)
  const spinSign = i8(n)
  const absorbed = u8(n)
  const history = u8(n * nApp)

  return {
    nParticles: n,
    nHero,
    nT,
    nApparatus: nApp,
    heroPos,
    heroSpinTheta,
    heroSpinSign,
    heroBirth,
    heroSampleDt,
    hitTime,
    hitY,
    hitZ,
    absorbed,
    spinTheta,
    spinSign,
    history,
    tTotal,
  }
}

export interface WasmModule {
  run_simulation(configJson: string): ArrayBuffer
}

let wasmPromise: Promise<SimRunner | null> | null = null

export interface SimRunner {
  kind: 'wasm' | 'js'
  run(cfg: SimulationConfig): SimResult
}

export function loadEngine(): Promise<SimRunner | null> {
  if (!wasmPromise) {
    wasmPromise = (async () => {
      try {
        const mod = (await import('./wasm-pkg/sg_physics.js')) as unknown as WasmGlue
        if (typeof mod.run_simulation !== 'function') return null
        if (mod.default) await mod.default()
        return {
          kind: 'wasm',
          run: (cfg) => {
            const u8 = mod.run_simulation(JSON.stringify(cfg))
            return parseWasmResult(u8.buffer as ArrayBuffer, u8.byteOffset)
          },
        }
      } catch {
        return null
      }
    })()
  }
  return wasmPromise
}
