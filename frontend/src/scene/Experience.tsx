import { Canvas } from '@react-three/fiber'
import { OrbitControls, Stars, Environment, Lightformer } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import { Beamline } from './Beamline'
import { TimelineDriver } from './TimelineDriver'
import { Particles } from './Particles'
import { QuantumField } from './QuantumField'
import { BellScene } from './BellScene'
import { useStore } from '../state/store'

export function Experience() {
  const kind = useStore((s) => s.kind)
  return (
    <Canvas
      camera={{ position: [-60, -320, 230], fov: 40, near: 1, far: 8000 }}
      gl={{ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
      dpr={[1, 2]}
      onCreated={({ gl }) => {
        gl.toneMappingExposure = 1.6
      }}
    >
      <color attach="background" args={['#14203a']} />
      <fog attach="fog" args={['#14203a', 2000, 4600]} />

      <ambientLight intensity={0.9} />
      <hemisphereLight intensity={0.8} color="#9dc0ff" groundColor="#3a4a5c" />
      <directionalLight position={[400, -500, 700]} intensity={3.0} color="#ffffff" />
      <directionalLight position={[-400, 350, 200]} intensity={1.1} color="#7ea4ff" />
      <directionalLight position={[100, 200, -600]} intensity={0.7} color="#c9d8ff" />
      {/* key lights riding along the beamline */}
      <spotLight
        position={[250, -260, 420]}
        target-position={[350, 0, 0]}
        angle={0.9}
        penumbra={0.6}
        intensity={800000}
        distance={2000}
        decay={2}
        color="#ffe9cf"
      />
      <spotLight
        position={[500, 240, 260]}
        target-position={[350, 0, 0]}
        angle={0.9}
        penumbra={0.7}
        intensity={450000}
        distance={2000}
        decay={2}
        color="#bcd4ff"
      />

      {/* procedural studio environment — gives metals something to reflect,
          fully offline (no HDR downloads) */}
      <Environment resolution={256} frames={1}>
        <color attach="background" args={['#2c4270']} />
        <Lightformer intensity={8} position={[0, 400, 250]} scale={[700, 160, 1]} color="#f2f7ff" />
        <Lightformer intensity={4} position={[-500, 100, 0]} rotation-y={Math.PI / 2} scale={[500, 140, 1]} color="#b9d2ff" />
        <Lightformer intensity={4} position={[500, -100, 0]} rotation-y={-Math.PI / 2} scale={[500, 140, 1]} color="#9fb9ef" />
        <Lightformer intensity={3} position={[0, 0, 500]} scale={[600, 200, 1]} color="#dfe9ff" />
        <Lightformer intensity={2} position={[0, -350, 0]} rotation-x={Math.PI / 2} scale={[600, 300, 1]} color="#4d678f" />
      </Environment>

      <Stars radius={2500} depth={600} count={3500} factor={6} fade speed={0.4} />

      {kind === 'cascade' ? (
        <>
          <Beamline />
          <Particles />
          <QuantumField />
          <OrbitControls makeDefault target={[350, 0, 0]} maxDistance={2600} minDistance={80} />
        </>
      ) : (
        <>
          <BellScene />
          <OrbitControls makeDefault target={[0, 0, 0]} maxDistance={2600} minDistance={80} />
        </>
      )}

      <EffectComposer>
        <Bloom intensity={0.7} luminanceThreshold={0.32} luminanceSmoothing={0.35} mipmapBlur radius={0.7} />
        <Vignette eskil={false} offset={0.25} darkness={0.5} />
      </EffectComposer>

      <TimelineDriver />
    </Canvas>
  )
}
