export type PhysicsMode = 'classical' | 'semiclassical' | 'quantum'
export type PortSide = 'up' | 'down'

export interface Apparatus {
  id: string
  /** beam this apparatus sits on: 'root' (source beam) or `${appId}:up` / `${appId}:down` */
  attachTo: string
  /** m, position of magnet entrance along beam X */
  xStart: number
  /** m, magnet length along beam */
  length: number
  /** deg, rotation around beam axis; 0 = vertical split (Z) */
  angleDeg: number
  /** T/m, field gradient dB/dz_local */
  gradient: number
  /** T, uniform field offset B0 */
  b0: number
  /** m, half pole gap */
  gap: number
  blockedPort: PortSide | null
}

export interface SourceParams {
  /** m/s, mean beam velocity */
  vMean: number
  /** m/s, velocity spread (thermal) */
  vSigma: number
  /** m, half-size of emitting slit */
  aperture: number
  /** rad, angular divergence (sigma) */
  divergence: number
}

export interface SimulationConfig {
  mode: PhysicsMode
  source: SourceParams
  /** sorted by xStart */
  apparatuses: Apparatus[]
  /** m, detector screen position */
  screenX: number
  particleCount: number
  heroCount: number
  seed: number
}

export interface SimResult {
  nParticles: number
  nHero: number
  nT: number
  nApparatus: number
  /** [nHero*nT*3] hero trajectory points, meters (after last event position repeats) */
  heroPos: Float64Array
  /** [nHero*nT] spin axis angle theta (rad) at each sample, NaN if unmeasured */
  heroSpinTheta: Float64Array
  /** [nHero*nT] spin sign at each sample: +1 up / -1 down / 0 unmeasured */
  heroSpinSign: Int8Array
  /** [nHero] birth time of hero particles */
  heroBirth: Float64Array
  /** [nHero] time between recorded samples (per particle, depends on its speed) */
  heroSampleDt: Float64Array
  /** [n] landing time (screen crossing or blocker absorption) */
  hitTime: Float64Array
  /** [n] landing transverse position, meters */
  hitY: Float64Array
  hitZ: Float64Array
  /** [n] 1 = absorbed by blocker (not counted on screen) */
  absorbed: Uint8Array
  /** [n] final spin axis angle (rad), NaN if never measured */
  spinTheta: Float64Array
  /** [n] final spin sign: +1/-1/0 */
  spinSign: Int8Array
  /** [n*nApparatus] 0 = down, 1 = up, 255 = not reached */
  history: Uint8Array
  tTotal: number
}
