import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../state/store'
import { M_TO_UNITS } from '../physics/constants'
import { evalRho } from '../physics/quantum'

/** Additive heatmap of |psi|^2 with spin asymmetry coloring (orange/blue). */
export function QuantumField() {
  const quantum = useStore((s) => s.quantum)
  const mode = useStore((s) => s.config.mode)

  const texture = useMemo(() => {
    const t = new THREE.DataTexture(new Uint8Array(4), 1, 1)
    t.format = THREE.RGBAFormat
    t.minFilter = THREE.LinearFilter
    t.magFilter = THREE.LinearFilter
    t.flipY = false
    return t
  }, [])

  const header = quantum?.header ?? null
  const lastKey = useRef('')

  useEffect(() => {
    if (!header) return
    lastKey.current = `${header.cols}x${header.rows}`
    const nd = new Uint8Array(header.cols * header.rows * 4)
    texture.image = { width: header.cols, height: header.rows, data: nd }
    texture.needsUpdate = true
  }, [header, texture])

  useEffect(() => () => texture.dispose(), [texture])

  useFrame(() => {
    if (!header || !quantum || quantum.branches.length === 0) return
    if (quantum.status !== 'running' && quantum.status !== 'done') return
    const img = texture.image.data as Uint8Array
    const { cols, rows } = header
    if (img.length < cols * rows * 4) return
    const t = Math.min(header.tTotal, useStore.getState().tCurrent)
    const key = `${t.toFixed(4)}|${quantum.branches.length}`
    if (key === lastKey.current) return
    lastKey.current = key

    let max = 1e-12
    const vals = new Float32Array(cols * rows)
    const asyms = new Float32Array(cols * rows)
    for (let r = 0; r < rows; r++) {
      const z = header.zMax - ((r + 0.5) / rows) * (header.zMax - header.zMin)
      for (let c = 0; c < cols; c++) {
        const x = header.xMin + ((c + 0.5) / cols) * (header.xMax - header.xMin)
        const { rho, asym } = evalRho({ header, branches: quantum.branches }, x, z, t)
        vals[r * cols + c] = rho
        asyms[r * cols + c] = asym
        if (rho > max) max = rho
      }
    }
    const inv = 1 / max
    for (let i = 0; i < cols * rows; i++) {
      const v = Math.pow(vals[i] * inv, 0.55)
      const asym = asyms[i]
      const o = i * 4
      img[o] = (255 * v * (0.3 + 0.8 * Math.max(0, asym))) | 0
      img[o + 1] = (255 * v * 0.42) | 0
      img[o + 2] = (255 * v * (0.3 + 0.8 * Math.max(0, -asym))) | 0
      img[o + 3] = (255 * Math.min(1, v * 1.4)) | 0
    }
    texture.needsUpdate = true
  })

  if (mode !== 'quantum' || !header || !quantum || quantum.branches.length === 0) return null
  const w = (header.xMax - header.xMin) * M_TO_UNITS
  const h = (header.zMax - header.zMin) * M_TO_UNITS
  const cx = ((header.xMax + header.xMin) / 2) * M_TO_UNITS
  const cz = ((header.zMax + header.zMin) / 2) * M_TO_UNITS

  return (
    <mesh position={[cx, 0, cz]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial
        map={texture}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
  )
}
