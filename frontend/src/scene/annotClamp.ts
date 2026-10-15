type Offset = { x: number; y: number }
type Block = { left: number; top: number; right: number; bottom: number; side: 'top' | 'bottom' | 'left' | 'right' }
type Item = {
  el: HTMLElement
  o: Offset
  r: { left: number; top: number; right: number; bottom: number }
  dx: number
  dy: number
}

const offsets = new WeakMap<HTMLElement, Offset>()
let raf = 0

function readBlocks(): Block[] {
  const out: Block[] = []
  document.querySelectorAll<HTMLElement>('.topbar, .bottombar, .left-panel, .right-stack').forEach((n) => {
    const r = n.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) return
    const side: Block['side'] = n.classList.contains('topbar')
      ? 'top'
      : n.classList.contains('bottombar')
        ? 'bottom'
        : n.classList.contains('left-panel')
          ? 'left'
          : 'right'
    out.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, side })
  })
  return out
}

function step() {
  const cards = [...document.querySelectorAll<HTMLElement>('.annot')]
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (!cards.length) {
    raf = requestAnimationFrame(step)
    return
  }
  const blocks = readBlocks()
  const items: Item[] = cards.map((el) => {
    const o = offsets.get(el) ?? { x: 0, y: 0 }
    const r = el.getBoundingClientRect()
    return { el, o, r, dx: 0, dy: 0 }
  })

  for (const it of items) {
    let dx = 0
    let dy = 0
    const l = it.r.left - it.o.x
    const t = it.r.top - it.o.y
    const r = it.r.right - it.o.x
    const b = it.r.bottom - it.o.y
    if (t < 8) dy += 8 - t
    if (b > vh - 8) dy -= b - (vh - 8)
    if (l < 8) dx += 8 - l
    if (r > vw - 8) dx -= r - (vw - 8)
    for (const bl of blocks) {
      const cl = l + dx
      const ct = t + dy
      const cr = r + dx
      const cb = b + dy
      const oX = Math.min(cr, bl.right) - Math.max(cl, bl.left)
      const oY = Math.min(cb, bl.bottom) - Math.max(ct, bl.top)
      if (oX > 2 && oY > 2) {
        if (bl.side === 'top') dy += bl.bottom - ct
        else if (bl.side === 'bottom') dy -= cb - bl.top
        else if (bl.side === 'left') dx += bl.right - cl
        else dx -= cr - bl.left
      }
    }
    it.dx = dx
    it.dy = dy
  }

  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const A = items[i]
        const B = items[j]
        const al = A.r.left + A.dx
        const at = A.r.top + A.dy
        const ar = A.r.right + A.dx
        const ab = A.r.bottom + A.dy
        const bl = B.r.left + B.dx
        const bt = B.r.top + B.dy
        const br = B.r.right + B.dx
        const bb = B.r.bottom + B.dy
        const ox = Math.min(ar, br) - Math.max(al, bl)
        const oy = Math.min(ab, bb) - Math.max(at, bt)
        if (ox > 4 && oy > 4) {
          const roomDown = vh - 86 - bb
          const roomUp = at - 62
          const shift = oy + 4
          if (roomDown >= shift || roomDown >= roomUp) B.dy += Math.min(shift, Math.max(roomDown, 0))
          else if (roomUp > 0) A.dy -= Math.min(shift, roomUp)
        }
      }
    }
  }

  for (const it of items) {
    offsets.set(it.el, { x: it.dx, y: it.dy })
    it.el.style.transform = it.dx || it.dy ? `translate(${it.dx}px, ${it.dy}px)` : ''
  }
  raf = requestAnimationFrame(step)
}

function ensureLoop() {
  const w = window as unknown as { __annotClampLoop?: boolean }
  if (w.__annotClampLoop) return
  w.__annotClampLoop = true
  raf = requestAnimationFrame(step)
}

ensureLoop()

const meta = import.meta as unknown as { hot?: { dispose: (cb: () => void) => void } }
meta.hot?.dispose(() => {
  cancelAnimationFrame(raf)
  const w = window as unknown as { __annotClampLoop?: boolean }
  w.__annotClampLoop = false
})
