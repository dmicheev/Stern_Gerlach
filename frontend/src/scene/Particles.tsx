import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../state/store'
import { M_TO_UNITS } from '../physics/constants'
import { spinColor } from './ApparatusModel'
import type { SimResult } from '../physics/types'

const dummy = new THREE.Object3D()

function ParticleSet({ result, ghost }: { result: SimResult | null; ghost: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const colorCache = useMemo(() => new Map<string, THREE.Color>(), [])

  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    if (!result) {
      mesh.count = 0
      return
    }
    const { tCurrent } = useStore.getState()
    const { nHero, nT } = result
    mesh.count = nHero
    for (let i = 0; i < nHero; i++) {
      const birth = result.heroBirth[i]
      let visible = true
      let idx = 0
      if (tCurrent < birth) {
        visible = false
      } else {
        const sdt = result.heroSampleDt[i] || 1e-6
        idx = Math.min(nT - 1, Math.floor((tCurrent - birth) / sdt))
        if (tCurrent >= result.hitTime[i]) visible = false
      }
      if (!visible) {
        dummy.position.set(0, 0, 0)
        dummy.scale.setScalar(0)
      } else {
        const base = (i * nT + idx) * 3
        dummy.position.set(
          result.heroPos[base] * M_TO_UNITS,
          result.heroPos[base + 1] * M_TO_UNITS,
          result.heroPos[base + 2] * M_TO_UNITS,
        )
        dummy.scale.setScalar(ghost ? 0.9 : 1.1)
      }
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)

      if (!ghost) {
        const sign = visible ? result.heroSpinSign[i * nT + idx] : 0
        const theta = result.heroSpinTheta[i * nT + idx] || 0
        const key = `${theta.toFixed(3)}|${sign}`
        let color = colorCache.get(key)
        if (!color) {
          const [r, g, b] = sign === 0 ? [0.92, 0.95, 1] : spinColor(theta, sign)
          color = new THREE.Color(r, g, b)
          colorCache.set(key, color)
        }
        mesh.setColorAt(i, color)
      }
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(1, result?.nHero ?? 1)]} frustumCulled={false}>
      <sphereGeometry args={[1, 10, 8]} />
      <meshBasicMaterial
        color={ghost ? 0x8899aa : 0xffffff}
        transparent={ghost}
        opacity={ghost ? 0.4 : 1}
        toneMapped={false}
      />
    </instancedMesh>
  )
}

export function Particles() {
  const result = useStore((s) => s.result)
  const ghostResult = useStore((s) => s.ghostResult)
  const mode = useStore((s) => s.config.mode)
  const showGhost = useStore((s) => s.showGhost)

  if (mode === 'quantum') return <ParticleSet result={null} ghost={false} />
  return (
    <>
      <ParticleSet result={result} ghost={false} />
      {showGhost && <ParticleSet result={ghostResult} ghost />}
    </>
  )
}
