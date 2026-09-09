import { useMemo } from 'react'
import { Line } from '@react-three/drei'
import { useStore } from '../state/store'
import { M_TO_UNITS } from '../physics/constants'
import { buildBeamTree, beamSegments } from '../physics/beams'
import { Furnace } from './Furnace'
import { Collimator } from './Collimator'
import { ApparatusModel } from './ApparatusModel'
import { DetectorScreen } from './DetectorScreen'

export function Beamline() {
  const config = useStore((s) => s.config)

  const { nodes, segments } = useMemo(() => {
    const tree = buildBeamTree(config.apparatuses, config.source.vMean)
    const segs = beamSegments(tree, config.screenX, config.source.vMean)
    return { nodes: tree.nodes, segments: segs }
  }, [config.apparatuses, config.source.vMean, config.screenX])

  return (
    <group>
      <Furnace />
      <Collimator />
      {nodes.map((node) => (
        <ApparatusModel key={node.app.id} apparatus={node.app} cy={node.cy} cz={node.cz} />
      ))}
      <DetectorScreen />
      {/* beam rays: root beam, branch beams, continuations to the screen */}
      {segments.map((seg, i) => (
        <Line
          key={i}
          points={[
            [seg.from[0] * M_TO_UNITS, seg.from[1] * M_TO_UNITS, seg.from[2] * M_TO_UNITS],
            [seg.to[0] * M_TO_UNITS, seg.to[1] * M_TO_UNITS, seg.to[2] * M_TO_UNITS],
          ]}
          color="#3a6ab8"
          lineWidth={1}
          dashed
          dashScale={6}
          transparent
          opacity={0.55}
        />
      ))}
    </group>
  )
}
