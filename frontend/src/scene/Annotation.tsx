import { Html } from '@react-three/drei'
import { Hint } from '../ui/Hint'

/**
 * Educational annotation card anchored to a 3D device (furnace, magnet, screen…).
 * Shows title, one-line description and an optional "?" linking to the hint DB.
 */
export function Annotation({
  position,
  title,
  desc,
  hintId,
}: {
  position: [number, number, number]
  title: string
  desc: string
  hintId?: string
}) {
  return (
    <Html position={position} center distanceFactor={undefined} zIndexRange={[40, 0]}>
      <div className="annot">
        <div className="annot-title">
          {title}
          {hintId && <Hint id={hintId} />}
        </div>
        <div className="annot-desc">{desc}</div>
      </div>
    </Html>
  )
}
