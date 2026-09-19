import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../state/store'
import { M_TO_UNITS } from '../physics/constants'
import { useTranslation } from 'react-i18next'
import { spinColor } from './ApparatusModel'
import { Annotation } from './Annotation'
import { sampleScreenHits, maxAxisExtent } from '../physics/quantum'
import { adaptiveZRangeMm } from '../physics/scale'
import { screenFrame, toScreenFrame } from '../physics/beams'

const W = 512
const H = 512

/** unified incremental hit source (cascade trajectories or quantum sampling) */
interface HitSource {
  times: Float64Array
  ys: Float64Array
  zs: Float64Array
  thetas: Float64Array
  signs: Int8Array
}

export function DetectorScreen() {
  const { t } = useTranslation()
  const kind = useStore((s) => s.kind)
  const showAnnot = useStore((s) => s.showAnnotations)
  const screenX = useStore((s) => s.config.screenX)
  const mode = useStore((s) => s.config.mode)
  const particleCount = useStore((s) => s.config.particleCount)
  const epoch = useStore((s) => s.epoch)
  const result = useStore((s) => s.result)
  const quantum = useStore((s) => s.quantum)
  const qHeader = quantum?.header ?? null
  const qBranches = quantum?.branches ?? null
  const apparatuses = useStore((s) => s.config.apparatuses)
  const vMean = useStore((s) => s.config.source.vMean)

  // screen plane is oriented along the LAST detector axis; the quantum model
  // deflects along n(theta) as well, so the same frame applies
  const frame = useMemo(() => screenFrame(apparatuses, vMean), [apparatuses, vMean])

  const canvas = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    return c
  }, [])

  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas)
    t.minFilter = THREE.LinearFilter
    return t
  }, [canvas])

  const lastDrawn = useRef(0)
  const sourceRef = useRef<HitSource | null>(null)

  // adaptive z half-range (mm): covers every hit of the run, quantized -> stable
  const zRange = useMemo(() => {
    let maxAbs = 0
    if (mode === 'quantum' && quantum?.header && quantum.branches.length) {
      const ext = maxAxisExtent({ header: quantum.header, branches: quantum.branches }, frame)
      return adaptiveZRangeMm(ext * M_TO_UNITS)
    }
    if (result) {
      for (let i = 0; i < result.nParticles; i++) {
        if (result.absorbed[i]) continue
        const { s } = toScreenFrame(frame, result.hitY[i], result.hitZ[i])
        const v = Math.abs(s) * M_TO_UNITS
        if (v > maxAbs) maxAbs = v
      }
    }
    return adaptiveZRangeMm(maxAbs)
  }, [mode, result, quantum, frame])
  const Z_SPAN = zRange * 2
  /** square screen: height equals the (adaptive) width */
  const Y_SPAN = Z_SPAN

  const clear = () => {
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#0a1424'
    ctx.fillRect(0, 0, W, H)
    ctx.strokeStyle = 'rgba(90,140,220,0.18)'
    ctx.lineWidth = 1
    for (let i = 1; i < 8; i++) {
      const x = (i * W) / 8
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
      const y = (i * H) / 8
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
    }
    texture.needsUpdate = true
    lastDrawn.current = 0
  }

  useEffect(() => {
    clear()
    sourceRef.current = null
  }, [clear, epoch, mode])

  useEffect(() => () => texture.dispose(), [texture])

  // rebuild the hit source when inputs change
  useEffect(() => {
    let src: HitSource | null = null
    if (mode === 'quantum') {
      if (qHeader && qBranches && qBranches.length) {
        const q = { header: qHeader, branches: qBranches }
        const n = Math.min(particleCount, 20000)
        const h = sampleScreenHits(q, screenX, n, 4242)
        src = { times: h.times, ys: h.ys, zs: h.zs, thetas: h.thetas, signs: h.signs }
      }
    } else if (result) {
      const order: number[] = []
      for (let i = 0; i < result.nParticles; i++) if (!result.absorbed[i]) order.push(i)
      order.sort((a, b) => result.hitTime[a] - result.hitTime[b])
      const m = order.length
      const times = new Float64Array(m)
      const ys = new Float64Array(m)
      const zs = new Float64Array(m)
      const thetas = new Float64Array(m)
      const signs = new Int8Array(m)
      for (let k = 0; k < m; k++) {
        const i = order[k]
        times[k] = result.hitTime[i]
        ys[k] = result.hitY[i]
        zs[k] = result.hitZ[i]
        thetas[k] = result.spinTheta[i]
        signs[k] = result.spinSign[i]
      }
      src = { times, ys, zs, thetas, signs }
    }
    sourceRef.current = src
    clear()
  }, [mode, result, qHeader, qBranches, screenX, particleCount, clear])

  useFrame(() => {
    const src = sourceRef.current
    if (!src) return
    const { tCurrent } = useStore.getState()
    const ctx = canvas.getContext('2d')!
    // binary search: first index with time > tCurrent
    let lo = lastDrawn.current
    if (lo > src.times.length) lo = src.times.length
    let hi = src.times.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (src.times[mid] <= tCurrent) lo = mid + 1
      else hi = mid
    }
    let drew = false
    for (let k = lastDrawn.current; k < lo; k++) {
      const { s, t } = toScreenFrame(frame, src.ys[k], src.zs[k])
      const z = s * M_TO_UNITS
      const y = t * M_TO_UNITS
      if (Math.abs(z) > Z_SPAN / 2 || Math.abs(y) > Y_SPAN / 2) continue
      const px = (z / Z_SPAN + 0.5) * W
      const py = (0.5 - y / Y_SPAN) * H
      const sign = src.signs[k]
      const [r, g, b] = sign === 0 ? [0.65, 0.8, 1] : spinColor(src.thetas[k], sign)
      ctx.fillStyle = `rgba(${(r * 255) | 0},${(g * 255) | 0},${(b * 255) | 0},0.85)`
      ctx.beginPath()
      ctx.arc(px, py, 1.5, 0, Math.PI * 2)
      ctx.fill()
      drew = true
    }
    if (drew) texture.needsUpdate = true
    lastDrawn.current = lo
  })

  const xU = screenX * M_TO_UNITS
  const openDetail = useStore((s) => s.setScreenDetailOpen)
  const setBellStation = useStore((s) => s.setBellDetailStation)
  return (
    <group position={[xU + 4, frame.cy * M_TO_UNITS, frame.cz * M_TO_UNITS]} rotation={[frame.theta, 0, 0]}>
      {/* glowing screen */}
      <mesh
        rotation={[0, -Math.PI / 2, 0]}
        onClick={(e) => {
          e.stopPropagation()
          setBellStation(null)
          openDetail(true)
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          document.body.style.cursor = ''
        }}
      >
        <planeGeometry args={[Z_SPAN, Y_SPAN]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      {/* invisible click slab around the screen (hits from any camera angle) */}
      <mesh
        onClick={(e) => {
          e.stopPropagation()
          setBellStation(null)
          openDetail(true)
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          document.body.style.cursor = ''
        }}
      >
        <boxGeometry args={[18, Y_SPAN + 26, Z_SPAN + 26]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {/* backlit frame */}
      <mesh position={[3, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[Z_SPAN + 8, Y_SPAN + 8]} />
        <meshStandardMaterial color="#32405c" metalness={0.5} roughness={0.4} />
      </mesh>
      {/* side rails */}
      <mesh position={[1.5, 0, Z_SPAN / 2 + 5]}>
        <boxGeometry args={[7, Y_SPAN + 10, 4]} />
        <meshStandardMaterial color="#52627a" metalness={0.5} roughness={0.35} />
      </mesh>
      <mesh position={[1.5, 0, -Z_SPAN / 2 - 5]}>
        <boxGeometry args={[7, Y_SPAN + 10, 4]} />
        <meshStandardMaterial color="#52627a" metalness={0.5} roughness={0.35} />
      </mesh>
      <pointLight position={[-30, 0, 0]} color="#3a5aff" intensity={8} distance={120} decay={2} />
      <spotLight
        position={[-260, -170, 270]}
        target-position={[-4, 0, 0]}
        angle={0.7}
        penumbra={0.7}
        intensity={160000}
        distance={900}
        decay={2}
        color="#dfeaff"
      />
      {kind === 'cascade' && showAnnot && (
        <Annotation position={[0, 0, Z_SPAN / 2 + 18]} title={t('annot.screen')} desc={t('annot.screenDesc')} hintId="hist" />
      )}
    </group>
  )
}
