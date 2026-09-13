import { AG_MASS, MU_B } from './constants'
import { buildCache, envelope, gapWindow, forceClassical, type AppCache } from './field'
import { buildBeamTree, ROOT_BEAM, type BeamApparatus, type BeamTree } from './beams'
import { Pcg32 } from './rng'
import type { SimulationConfig, SimResult } from './types'

const STEPS = 1200
const N_T = 180
const SAMPLE_EVERY = 7 // ~171 samples + final

export function runSimulation(cfg: SimulationConfig): SimResult {
  const rng = new Pcg32(cfg.seed >>> 0, 54n)
  const tree: BeamTree = buildBeamTree(cfg.apparatuses, cfg.source.vMean)
  const centers = new Map<string, { y: number; z: number }>()
  for (const n of tree.nodes) centers.set(n.app.id, { y: n.cy, z: n.cz })
  const caches = buildCache(cfg.apparatuses, centers)
  const cacheById = new Map<string, { cache: AppCache; node: BeamApparatus }>()
  for (const cache of caches) {
    const node = tree.nodes.find((n) => n.app.id === cache.id)
    if (node) cacheById.set(cache.id, { cache, node })
  }
  const nApp = caches.length
  const n = cfg.particleCount
  const nHero = Math.min(cfg.heroCount, n)

  const heroPos = new Float64Array(nHero * N_T * 3)
  const heroSpinTheta = new Float64Array(nHero * N_T).fill(NaN)
  const heroSpinSign = new Int8Array(nHero * N_T)
  const heroBirth = new Float64Array(nHero)
  const heroSampleDt = new Float64Array(nHero)
  const hitTime = new Float64Array(n)
  const hitY = new Float64Array(n)
  const hitZ = new Float64Array(n)
  const absorbed = new Uint8Array(n)
  const spinTheta = new Float64Array(n).fill(NaN)
  const spinSign = new Int8Array(n)
  const history = new Uint8Array(n * nApp).fill(255)

  const src = cfg.source
  const tEmit = 0.25 * (cfg.screenX / src.vMean)
  const classical = cfg.mode === 'classical'

  const acc = new Float64Array(3)
  const fbuf = new Float64Array(3)
  let tTotal = 0

  for (let i = 0; i < n; i++) {
    const isHero = i < nHero
    // Heroes are spread evenly over the emission window for a continuous beam look
    const t0 = isHero ? (tEmit * (i + 0.5)) / nHero : rng.nextFloat() * tEmit
    const p = {
      y: rng.normal() * src.aperture * 0.5,
      z: rng.normal() * src.aperture * 0.5,
      vy: 0,
      vz: 0,
      vx: 0,
      x: 0,
    }
    p.vx = Math.max(0.25 * src.vMean, src.vMean + rng.normal() * src.vSigma)
    p.vy = rng.normal() * src.divergence * p.vx
    p.vz = rng.normal() * src.divergence * p.vx

    // spin state (Y-Z plane): semiclassical starts unpolarized; classical fixed mu_hat
    let [sy, sz] = uniformYZ(rng)
    const mHatY = sy
    const mHatZ = sz

    const T = (cfg.screenX + 0.02) / p.vx
    const dt = T / STEPS

    // beam routing: which beam the particle is on + next apparatus there
    let beam = ROOT_BEAM
    let beamList = tree.beams.get(beam) ?? []
    let beamIdx = 0
    // apparatus currently being traversed (force source), null outside magnets
    let curApp: { cache: AppCache; node: BeamApparatus } | null = null

    let curTheta = NaN
    let curSign = 0
    let willAbsorb = false
    let isAbsorbed = false
    let landed = false
    let iSample = 0
    let t = t0
    const x0 = 0

    const recordSample = () => {
      if (!isHero || iSample >= N_T) return
      const base = (i * N_T + iSample) * 3
      heroPos[base] = p.x
      heroPos[base + 1] = p.y
      heroPos[base + 2] = p.z
      heroSpinTheta[i * N_T + iSample] = curTheta
      heroSpinSign[i * N_T + iSample] = curSign
      iSample++
    }

    recordSample()

    for (let k = 0; k < STEPS && !landed && !isAbsorbed; k++) {
      const px = p.x
      const py = p.y
      const pz = p.z

      // RK4 on (y, z, vy, vz); x(t) = x0 + vx*(t - t0) analytically
      const step = () => {
        const xt = (h: number, yy: number, zz: number) => {
          const xNow = x0 + p.vx * (t - t0 + h)
          acc[1] = 0
          acc[2] = 0
          if (classical) {
            forceClassical(caches, xNow, yy, zz, mHatY, mHatZ, MU_B, fbuf)
            acc[1] = fbuf[1] / AG_MASS
            acc[2] = fbuf[2] / AG_MASS
          } else if (curApp) {
            // force only from the magnet this particle is traversing
            const a = curApp.cache
            const yl = a.cos * (yy - a.cy) + a.sin * (zz - a.cz)
            const zl = -a.sin * (yy - a.cy) + a.cos * (zz - a.cz)
            const f = curSign * MU_B * a.G * envelope(xNow, a) * gapWindow(Math.hypot(yl, zl), a.gap)
            acc[1] = (f * a.ny) / AG_MASS
            acc[2] = (f * a.nz) / AG_MASS
          }
        }
        // k1
        xt(0, p.y, p.z)
        const k1y = p.vy, k1z = p.vz, k1vy = acc[1], k1vz = acc[2]
        // k2
        xt(dt / 2, p.y + (k1y * dt) / 2, p.z + (k1z * dt) / 2)
        const k2y = p.vy + (k1vy * dt) / 2, k2z = p.vz + (k1vz * dt) / 2
        const k2vy = acc[1], k2vz = acc[2]
        // k3
        xt(dt / 2, p.y + (k2y * dt) / 2, p.z + (k2z * dt) / 2)
        const k3y = p.vy + (k2vy * dt) / 2, k3z = p.vz + (k2vz * dt) / 2
        const k3vy = acc[1], k3vz = acc[2]
        // k4
        xt(dt, p.y + k3y * dt, p.z + k3z * dt)
        const k4y = p.vy + k3vy * dt, k4z = p.vz + k3vz * dt
        const k4vy = acc[1], k4vz = acc[2]

        p.y += (dt / 6) * (k1y + 2 * k2y + 2 * k3y + k4y)
        p.z += (dt / 6) * (k1z + 2 * k2z + 2 * k3z + k4z)
        p.vy += (dt / 6) * (k1vy + 2 * k2vy + 2 * k3vy + k4vy)
        p.vz += (dt / 6) * (k1vz + 2 * k2vz + 2 * k3vz + k4vz)
        t += dt
        p.x = x0 + p.vx * (t - t0)
      }
      step()

      // beam routing: measurement at the entrance of the next apparatus on our beam
      while (!classical && beamIdx < beamList.length && p.x >= beamList[beamIdx].app.xStart) {
        const node = beamList[beamIdx]
        const entry = cacheById.get(node.app.id)!
        curApp = entry
        const a = entry.cache
        const sd = sy * a.ny + sz * a.nz // s.n with s confined to Y-Z plane
        const pUp = (1 + sd) / 2
        const up = rng.nextFloat() < pUp
        curSign = up ? 1 : -1
        sy = curSign * a.ny
        sz = curSign * a.nz
        curTheta = a.angleRad
        spinTheta[i] = a.angleRad
        spinSign[i] = curSign as 1 | -1
        history[i * nApp + node.index] = up ? 1 : 0
        if ((a.blocked === 'up' && up) || (a.blocked === 'down' && !up)) willAbsorb = true
        // continue on the measured branch beam
        beam = `${node.app.id}:${up ? 'up' : 'down'}`
        beamList = tree.beams.get(beam) ?? []
        beamIdx = 0
        curApp = entry
      }

      // leave the magnet region: force off
      if (curApp && p.x > curApp.cache.xOut + 4 * curApp.cache.fr) curApp = null

      // classical blocker: the plate physically cuts the blocked half of the beam
      if (classical) {
        for (const a of caches) {
          if (!a.blocked) continue
          const xBlock = a.xOut + 0.004
          if (px < xBlock && p.x >= xBlock) {
            const d = (p.y - a.cy) * a.ny + (p.z - a.cz) * a.nz
            if ((a.blocked === 'up' && d > 0) || (a.blocked === 'down' && d < 0)) {
              isAbsorbed = true
              break
            }
          }
        }
        if (isAbsorbed) break
      }

      // blocker absorption shortly after magnet exit
      if (willAbsorb && curApp) {
        const a = curApp.cache
        if (p.x >= a.xOut + 0.004) {
          isAbsorbed = true
          break
        }
      }

      // screen crossing: interpolate linearly
      if (p.x >= cfg.screenX) {
        const frac = (cfg.screenX - px) / (p.x - px || 1)
        hitY[i] = py + (p.y - py) * frac
        hitZ[i] = pz + (p.z - pz) * frac
        hitTime[i] = t - dt + dt * frac
        landed = true
        break
      }

      if (k % SAMPLE_EVERY === 0) recordSample()
    }

    if (isAbsorbed) {
      hitY[i] = p.y
      hitZ[i] = p.z
      hitTime[i] = t
      absorbed[i] = 1
    } else if (!landed) {
      hitY[i] = p.y
      hitZ[i] = p.z
      hitTime[i] = t
    }

    // pad remaining hero samples with final position
    if (isHero) {
      heroBirth[i] = t0
      heroSampleDt[i] = dt * SAMPLE_EVERY
      while (iSample < N_T) {
        const base = (i * N_T + iSample) * 3
        heroPos[base] = p.x
        heroPos[base + 1] = p.y
        heroPos[base + 2] = p.z
        heroSpinTheta[i * N_T + iSample] = curTheta
        heroSpinSign[i * N_T + iSample] = curSign
        iSample++
      }
    }

    if (hitTime[i] > tTotal) tTotal = hitTime[i]
  }

  return {
    nParticles: n,
    nHero,
    nT: N_T,
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

function uniformYZ(rng: Pcg32): [number, number] {
  const a = rng.nextFloat() * 2 * Math.PI
  const c = rng.nextFloat() * 2 - 1
  const s = Math.sqrt(1 - c * c)
  return [s * Math.cos(a), s * Math.sin(a)]
}

export { N_T, STEPS }
