import type { ThreeEvent } from '@react-three/fiber'

export function fromCanvas(e: ThreeEvent<MouseEvent | PointerEvent>): boolean {
  const t = e.nativeEvent.target as HTMLElement | null
  return !!t && t.tagName === 'CANVAS'
}
