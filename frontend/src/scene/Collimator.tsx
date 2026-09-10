import { useTranslation } from 'react-i18next'
import { useStore } from '../state/store'
import { Annotation } from './Annotation'

/** Collimator slit at x=80mm: two plates forming a vertical slit along Z. */
export function Collimator() {
  const { t } = useTranslation()
  const show = useStore((s) => s.showAnnotations)
  const mat = <meshStandardMaterial color="#5b6a7e" metalness={0.5} roughness={0.32} />
  return (
    <group position={[80, 0, 0]}>
      {/* top plate */}
      <mesh position={[0, 0, 13]}>
        <boxGeometry args={[10, 34, 20]} />
        {mat}
      </mesh>
      {/* bottom plate */}
      <mesh position={[0, 0, -13]}>
        <boxGeometry args={[10, 34, 20]} />
        {mat}
      </mesh>
      {/* frame sides */}
      <mesh position={[0, 19, 0]}>
        <boxGeometry args={[10, 6, 46]} />
        {mat}
      </mesh>
      <mesh position={[0, -19, 0]}>
        <boxGeometry args={[10, 6, 46]} />
        {mat}
      </mesh>
      {show && (
        <Annotation position={[0, 0, 42]} title={t('annot.collimator')} desc={t('annot.collimatorDesc')} hintId="aperture" />
      )}
    </group>
  )
}
