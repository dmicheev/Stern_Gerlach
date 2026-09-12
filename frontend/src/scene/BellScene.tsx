import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Html, Line } from '@react-three/drei'
import { useTranslation } from 'react-i18next'
import { Annotation } from './Annotation'
import { useStore } from '../state/store'
import { M_TO_UNITS } from '../physics/constants'
import { BELL_LAYOUT } from '../physics/bell'
import { spinColor } from './ApparatusModel'

const SX = BELL_LAYOUT.stationX * M_TO_UNITS
const DX = BELL_LAYOUT.detectorX * M_TO_UNITS
const LX = BELL_LAYOUT.magnetLen * M_TO_UNITS
const V_MM = BELL_LAYOUT.v * M_TO_UNITS // mm per second

const dummy = new THREE.Object3D()

/** entangled pair source (station C analog): crystal + herald flash */
function PairSource() {
  const { t } = useTranslation()
  const showAnnot = useStore((s) => s.showAnnotations)
  const glow = useRef<THREE.Mesh>(null)
  const light = useRef<THREE.PointLight>(null)
  useFrame(({ clock }) => {
    const s = useStore.getState()
    const r = s.bellResult
    let flash = 0.25
    if (r) {
      for (let i = 0; i < r.nHero; i++) {
        const d = Math.abs(r.tBirth[i] - s.tCurrent)
        if (d < 0.0025) flash = Math.max(flash, 1 - d / 0.0025)
        if (r.tBirth[i] > s.tCurrent + 0.003) break
      }
    }
    const t = clock.elapsedTime
    if (glow.current) {
      glow.current.scale.setScalar(1 + flash * 1.6 + 0.05 * Math.sin(t * 5))
      ;(glow.current.material as THREE.MeshBasicMaterial).opacity = 0.5 + flash * 0.5
    }
    if (light.current) light.current.intensity = 20 + flash * 260 + 4 * Math.sin(t * 7)
  })
  return (
    <group>
      <mesh>
        <cylinderGeometry args={[7, 7, 26, 12]} />
        <meshStandardMaterial color="#3d4a63" metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[7, 7, 26, 12]} />
        <meshStandardMaterial color="#46536e" metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh ref={glow}>
        <sphereGeometry args={[5, 16, 12]} />
        <meshBasicMaterial color="#c48bff" transparent opacity={0.7} toneMapped={false} />
      </mesh>
      <pointLight ref={light} color="#b97dff" intensity={20} distance={220} decay={2} />
      {showAnnot && (
        <Annotation position={[0, 0, 48]} title={t('annot.source')} desc={t('annot.sourceDesc')} hintId="bellSource" />
      )}
      {/* event-ready ring */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[11, 0.7, 8, 40]} />
        <meshBasicMaterial color="#7dd0ff" toneMapped={false} transparent opacity={0.6} />
      </mesh>
    </group>
  )
}

interface StationProps {
  side: -1 | 1
  label: string
  color: string
}

/** measurement station: SG magnet snapping to the chosen basis + two-port detector */
function BellStation({ side, label, color }: StationProps) {
  const { t } = useTranslation()
  const showAnnot = useStore((s) => s.showAnnotations)
  const magnet = useRef<THREE.Group>(null)
  const lamp = useRef<THREE.Mesh>(null)
  const x0 = side * SX
  const detX = side * DX

  useFrame((_, delta) => {
    const s = useStore.getState()
    const r = s.bellResult
    if (!r || !magnet.current) return
    let angle = magnet.current.rotation.x
    let flash = 0
    let chosen = -1
    for (let i = 0; i < r.nHero; i++) {
      if (r.tBirth[i] <= s.tCurrent) chosen = i
      else break
    }
    if (chosen >= 0) {
      angle = side < 0 ? r.angleA[chosen] : r.angleB[chosen]
      const dt = s.tCurrent - r.tBirth[chosen]
      if (dt < 0.004) flash = 1 - dt / 0.004
    }
    // fast snap toward the chosen basis (mimics the fast random basis switch)
    magnet.current.rotation.x += (angle - magnet.current.rotation.x) * Math.min(1, delta * 28)
    if (lamp.current) {
      const m = lamp.current.material as THREE.MeshBasicMaterial
      m.opacity = 0.25 + flash * 0.75
      lamp.current.scale.setScalar(1 + flash * 0.8)
    }
  })

  return (
    <group>
      {/* magnet: centered on x0, rotation.x = live basis angle */}
      <group ref={magnet} position={[x0, 0, 0]}>
        <mesh position={[0, 0, 22]}>
          <boxGeometry args={[LX, 24, 26]} />
          <meshStandardMaterial color="#7b8595" metalness={0.55} roughness={0.34} />
        </mesh>
        <mesh position={[0, 0, -22]}>
          <boxGeometry args={[LX, 30, 26]} />
          <meshStandardMaterial color="#7b8595" metalness={0.55} roughness={0.34} />
        </mesh>
        <mesh position={[0, 0, 8.5]}>
          <boxGeometry args={[LX, 4, 2.5]} />
          <meshStandardMaterial color="#7a4040" metalness={0.7} roughness={0.4} emissive="#331111" />
        </mesh>
        <mesh position={[0, 0, -8.5]}>
          <boxGeometry args={[LX, 16, 2.5]} />
          <meshStandardMaterial color="#40527a" metalness={0.7} roughness={0.4} emissive="#111533" />
        </mesh>
      </group>

      {/* QRNG lamp */}
      <mesh ref={lamp} position={[x0, 26, 0]}>
        <sphereGeometry args={[2.6, 10, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.4} toneMapped={false} />
      </mesh>

      {/* two-port detector */}
      <group position={[detX, 0, 0]}>
        <mesh position={[0, 0, 14]}>
          <boxGeometry args={[5, 46, 22]} />
          <meshStandardMaterial color="#32405c" metalness={0.5} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0, -14]}>
          <boxGeometry args={[5, 46, 22]} />
          <meshStandardMaterial color="#32405c" metalness={0.5} roughness={0.4} />
        </mesh>
        <mesh position={[-side * 3, 0, 0]}>
          <boxGeometry args={[2, 50, 8]} />
          <meshStandardMaterial color="#202a3e" metalness={0.6} roughness={0.35} />
        </mesh>
        {/* invisible click slab covering the whole detector (plates face the beam, hard to hit) */}
        <mesh
          onClick={(e) => {
            e.stopPropagation()
            useStore.getState().setBellDetailStation(side)
            useStore.getState().setScreenDetailOpen(true)
          }}
          onPointerOver={(e) => {
            e.stopPropagation()
            document.body.style.cursor = 'pointer'
          }}
          onPointerOut={() => {
            document.body.style.cursor = ''
          }}
        >
          <boxGeometry args={[18, 64, 64]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>

      <StationDots side={side} />

      {/* label plate */}
      <group position={[x0, -46, 26]}>
        <mesh>
          <boxGeometry args={[26, 10, 2]} />
          <meshBasicMaterial color={color} transparent opacity={0.32} toneMapped={false} />
        </mesh>
      </group>
      <Html position={[x0, -46, 30]} center style={{ pointerEvents: 'none' }}>
        <div style={{ color, fontSize: 12, fontWeight: 700, textShadow: '0 0 8px #000', letterSpacing: '0.1em' }}>
          {label}
        </div>
      </Html>
      {showAnnot && (
        <Annotation
          position={[x0, 0, 66]}
          title={`${t('annot.station')} ${label}`}
          desc={t('annot.stationDesc')}
          hintId="bellStation"
        />
      )}
      {showAnnot && (
        <Annotation
          position={[detX, 0, 44]}
          title={t('annot.detectors')}
          desc={t('annot.detectorsDesc')}
          hintId="chshE"
        />
      )}
    </group>
  )
}

/** accumulating dots on the two output ports of a station */
function StationDots({ side }: { side: -1 | 1 }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const texRef = useRef<THREE.CanvasTexture | null>(null)
  const drawnRef = useRef(0)
  const lastEpoch = useRef(-1)
  const detX = side * DX

  useFrame(() => {
    const s = useStore.getState()
    const r = s.bellResult
    if (!r || !texRef.current) return
    const canvas = canvasRef.current!
    if (lastEpoch.current !== s.epoch) {
      lastEpoch.current = s.epoch
      canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
      drawnRef.current = 0
      texRef.current.needsUpdate = true
    }
    const ctx = canvas.getContext('2d')!
    let lo = drawnRef.current
    let hi = r.nHero
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (r.tLand[mid] <= s.tCurrent) lo = mid + 1
      else hi = mid
    }
    for (let k = drawnRef.current; k < lo; k++) {
      const outcome = side < 0 ? r.outcomeA[k] : r.outcomeB[k]
      if (outcome === 0) continue
      const angle = side < 0 ? r.angleA[k] : r.angleB[k]
      const [cr, cg, cb] = spinColor(angle, outcome)
      const px = 8 + ((k * 37) % 112)
      const py = outcome > 0 ? 10 + ((k * 53) % 100) : 146 + ((k * 53) % 100)
      ctx.fillStyle = `rgba(${(cr * 255) | 0},${(cg * 255) | 0},${(cb * 255) | 0},0.6)`
      ctx.beginPath()
      ctx.arc(px, py, 2.2, 0, Math.PI * 2)
      ctx.fill()
    }
    if (lo > drawnRef.current) {
      drawnRef.current = lo
      texRef.current.needsUpdate = true
    }
  })

  if (!canvasRef.current) {
    const c = document.createElement('canvas')
    c.width = 128
    c.height = 256
    canvasRef.current = c
    texRef.current = new THREE.CanvasTexture(c)
  }

  return (
    <mesh position={[detX - side * 3.6, 0, 0]} rotation={[0, (-side * Math.PI) / 2, 0]}>
      <planeGeometry args={[46, 66]} />
      <meshBasicMaterial map={texRef.current!} transparent toneMapped={false} opacity={0.95} />
    </mesh>
  )
}

/** hero pairs flying apart + entanglement threads */
function BellParticles() {
  const left = useRef<THREE.InstancedMesh>(null)
  const right = useRef<THREE.InstancedMesh>(null)
  const threads = useRef<THREE.LineSegments>(null)
  const violet = useRef(new THREE.Color(0.72, 0.55, 1))
  const white = useRef(new THREE.Color(0.93, 0.95, 1))

  useFrame(() => {
    const s = useStore.getState()
    const r = s.bellResult
    if (!r || !left.current || !right.current) return
    const t = s.tCurrent
    const n = r.nHero
    left.current.count = n
    right.current.count = n
    const threadPts: number[] = []
    for (let i = 0; i < n; i++) {
      const t0 = r.tBirth[i]
      const tM = r.tMeasure[i]
      let x = 0
      let scale = 1.15
      let color = violet.current
      if (t < t0) {
        scale = 0
      } else if (t < tM) {
        x = Math.min(SX, V_MM * (t - t0))
        threadPts.push(-x, 0, 0, x, 0, 0)
      } else if (t >= r.tLand[i]) {
        scale = 0
      } else {
        x = SX + (DX - SX) * ((t - tM) / (r.tLand[i] - tM || 1))
        color = white.current
      }
      dummy.position.set(-x, 0, 0)
      dummy.scale.setScalar(scale)
      dummy.updateMatrix()
      left.current.setMatrixAt(i, dummy.matrix)
      dummy.position.set(x, 0, 0)
      dummy.updateMatrix()
      right.current.setMatrixAt(i, dummy.matrix)
      left.current.setColorAt(i, color)
      right.current.setColorAt(i, color)
    }
    left.current.instanceMatrix.needsUpdate = true
    right.current.instanceMatrix.needsUpdate = true
    if (left.current.instanceColor) left.current.instanceColor.needsUpdate = true
    if (right.current.instanceColor) right.current.instanceColor.needsUpdate = true

    if (threads.current) {
      const geo = threads.current.geometry
      geo.setAttribute('position', new THREE.Float32BufferAttribute(threadPts, 3))
      geo.setDrawRange(0, threadPts.length / 3)
    }
  })

  return (
    <>
      <instancedMesh ref={left} args={[undefined, undefined, 200]} frustumCulled={false}>
        <sphereGeometry args={[1.1, 10, 8]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={right} args={[undefined, undefined, 200]} frustumCulled={false}>
        <sphereGeometry args={[1.1, 10, 8]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <lineSegments ref={threads} frustumCulled={false}>
        <bufferGeometry />
        <lineBasicMaterial color="#9a6bff" transparent opacity={0.22} toneMapped={false} />
      </lineSegments>
    </>
  )
}

export function BellScene() {
  const kind = useStore((s) => s.kind)
  if (kind !== 'bell') return null
  return (
    <group>
      <Line
        points={[
          [0, 0, 0],
          [DX + 40, 0, 0],
        ]}
        color="#2a4a7a"
        lineWidth={1}
        dashed
        dashScale={4}
        transparent
        opacity={0.5}
      />
      <Line
        points={[
          [0, 0, 0],
          [-DX - 40, 0, 0],
        ]}
        color="#2a4a7a"
        lineWidth={1}
        dashed
        dashScale={4}
        transparent
        opacity={0.5}
      />
      <PairSource />
      <BellStation side={-1} label="A" color="#7ad0ff" />
      <BellStation side={1} label="B" color="#ffb36b" />
      <BellParticles />
    </group>
  )
}
