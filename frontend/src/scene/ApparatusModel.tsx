import { useRef } from 'react'
import { Html } from '@react-three/drei'
import { TransformControls } from '@react-three/drei'
import { useStore } from '../state/store'
import { Annotation } from './Annotation'
import { M_TO_UNITS } from '../physics/constants'
import type { Apparatus } from '../physics/types'
import { useTranslation } from 'react-i18next'
import type { Group } from 'three'
import * as THREE from 'three'
import type React from 'react'

const TAU = Math.PI * 2

export function ApparatusModel({ apparatus, cy = 0, cz = 0 }: { apparatus: Apparatus; cy?: number; cz?: number }) {
  const selectedId = useStore((s) => s.selectedApparatusId)
  const setSelected = useStore((s) => s.setSelected)
  const updateApparatus = useStore((s) => s.updateApparatus)
  const ref = useRef<Group>(null)
  const selected = selectedId === apparatus.id
  const { t } = useTranslation()
  const showAnnot = useStore((s) => s.showAnnotations)

  const L = apparatus.length * M_TO_UNITS
  const gapU = apparatus.gap * M_TO_UNITS
  const theta = (apparatus.angleDeg * Math.PI) / 180

  const metal = (
    <meshStandardMaterial color="#7b8595" metalness={0.55} roughness={0.34} />
  )
  const darkMetal = <meshStandardMaterial color="#576274" metalness={0.5} roughness={0.3} />

  return (
    <group position={[apparatus.xStart * M_TO_UNITS, cy * M_TO_UNITS, cz * M_TO_UNITS]}>
      <group
        ref={ref}
        rotation={[theta, 0, 0]}
        onPointerDown={(e) => {
          e.stopPropagation()
          setSelected(apparatus.id)
        }}
      >
        {/* North pole (sharp edge, +z_local) */}
        <mesh position={[L / 2, 0, gapU + 16]}>
          <boxGeometry args={[L, 26, 28]} />
          {metal}
        </mesh>
        <mesh position={[L / 2, 0, gapU + 1.6]}>
          <boxGeometry args={[L, 5, 3.2]} />
          <meshStandardMaterial color="#7a4040" metalness={0.7} roughness={0.4} emissive="#331111" />
        </mesh>

        {/* South pole (grooved, -z_local) */}
        <mesh position={[L / 2, 0, -gapU - 16]}>
          <boxGeometry args={[L, 34, 28]} />
          {metal}
        </mesh>
        <mesh position={[L / 2, 0, -gapU - 1.8]}>
          <boxGeometry args={[L, 18, 3.6]} />
          <meshStandardMaterial color="#40527a" metalness={0.7} roughness={0.4} emissive="#111533" />
        </mesh>

        {/* yoke (C-shape behind, -y) */}
        <mesh position={[L / 2, -21, 0]}>
          <boxGeometry args={[L + 8, 7, 2 * gapU + 62]} />
          {darkMetal}
        </mesh>
        {/* coil hints */}
        <mesh position={[7, -13, 0]}>
          <boxGeometry args={[7, 12, 2 * gapU + 46]} />
          <meshStandardMaterial color="#e09b55" metalness={0.45} roughness={0.45} />
        </mesh>
        <mesh position={[L - 7, -13, 0]}>
          <boxGeometry args={[7, 12, 2 * gapU + 46]} />
          <meshStandardMaterial color="#e09b55" metalness={0.45} roughness={0.45} />
        </mesh>

        {/* blocker plate */}
        {apparatus.blockedPort && (
          <mesh position={[L + 5, 0, apparatus.blockedPort === 'up' ? 5.5 : -5.5]}>
            <boxGeometry args={[7, 30, 10]} />
            <meshStandardMaterial
              color="#8a2233"
              metalness={0.4}
              roughness={0.6}
              emissive="#40060f"
            />
          </mesh>
        )}

        {selected && (
          <mesh position={[L / 2, -6, 0]}>
            <boxGeometry args={[L + 18, 58, 2 * gapU + 76]} />
            <meshBasicMaterial color="#5cc8ff" wireframe transparent opacity={0.35} />
          </mesh>
        )}

        <Html position={[L / 2, 16, gapU + 32]} center style={{ pointerEvents: 'none' }}>
          <div style={{ color: '#ff7a7a', fontSize: 11, fontWeight: 700, textShadow: '0 0 6px #000' }}>N</div>
        </Html>
        <Html position={[L / 2, 16, -gapU - 32]} center style={{ pointerEvents: 'none' }}>
          <div style={{ color: '#7aa0ff', fontSize: 11, fontWeight: 700, textShadow: '0 0 6px #000' }}>S</div>
        </Html>
        {showAnnot && (
          <Annotation
            position={[L / 2, 0, gapU + 62]}
            title={`${t('annot.apparatus')} θ=${apparatus.angleDeg.toFixed(0)}°`}
            desc={`G = ${apparatus.gradient.toFixed(0)} Т/м · ${t('annot.apparatusDesc')}`}
            hintId="gradient"
          />
        )}
        <Html position={[L / 2, -34, 0]} center style={{ pointerEvents: 'none' }}>
          <div style={{ color: '#9fb6d9', fontSize: 10, opacity: 0.85, textShadow: '0 0 6px #000' }}>
            θ = {apparatus.angleDeg.toFixed(0)}°
          </div>
        </Html>
      </group>

      {selected && (
        <TransformControls
          object={ref as unknown as React.MutableRefObject<THREE.Group>}
          mode="rotate"
          showX
          showY={false}
          showZ={false}
          size={0.75}
          rotationSnap={Math.PI / 36}
          onObjectChange={() => {
            if (!ref.current) return
            let deg = (ref.current.rotation.x * 180) / Math.PI
            deg = ((deg % 360) + 360) % 360
            updateApparatus(apparatus.id, { angleDeg: Math.round(deg) })
          }}
        />
      )}
    </group>
  )
}

export function spinColor(theta: number, sign: number): [number, number, number] {
  if (sign === 0) return [0.92, 0.95, 1.0]
  const h = ((((theta + (sign > 0 ? 0 : Math.PI)) % TAU) + TAU) % TAU) / TAU
  const s = 0.85
  const l = sign > 0 ? 0.62 : 0.5
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h * 12) % 12
    return l - a * Math.max(-1, Math.min(Math.min(k - 3, 9 - k), 1))
  }
  return [f(0), f(8), f(4)]
}
