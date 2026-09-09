import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Mesh, PointLight } from 'three'

/** Silver oven at x=0 with a glowing aperture. Scene units: mm. */
export function Furnace() {
  const glow = useRef<Mesh>(null)
  const light = useRef<PointLight>(null)

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const s = 1 + 0.08 * Math.sin(t * 7.3) * Math.sin(t * 3.1)
    if (glow.current) glow.current.scale.setScalar(s)
    if (light.current) light.current.intensity = 26 + 5 * Math.sin(t * 9.7)
  })

  const body = (
    <>
      <mesh castShadow>
        <boxGeometry args={[56, 64, 64]} />
        <meshStandardMaterial color="#74808f" metalness={0.55} roughness={0.35} />
      </mesh>
      {/* ribs */}
      {[...Array(4)].map((_, i) => (
        <mesh key={i} position={[-18 + i * 12, 0, 34]}>
          <boxGeometry args={[6, 68, 4]} />
          <meshStandardMaterial color="#5a6577" roughness={0.3} />
        </mesh>
      ))}
    </>
  )

  return (
    <group position={[0, 0, 0]}>
      {body}
      {/* front plate with slit */}
      <mesh position={[30, 0, 0]}>
        <boxGeometry args={[4, 44, 44]} />
        <meshStandardMaterial color="#54606e" metalness={0.55} roughness={0.28} />
      </mesh>
      <mesh ref={glow} position={[32.6, 0, 0]}>
        <circleGeometry args={[2.6, 24]} />
        <meshBasicMaterial color="#ffb347" toneMapped={false} />
      </mesh>
      <pointLight ref={light} position={[40, 0, 0]} color="#ff9a3c" intensity={26} distance={160} decay={2} />
    </group>
  )
}
