import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../state/store'
import { hintsContent, type HintContent } from '../i18n/hints'

const POP_W = 350

/**
 * "?" mark with a rich tooltip (title, formula, paragraphs, list).
 * Rendered through a portal so panel scrollbars never clip it.
 * Hover on desktop, tap on touch.
 */
export function Hint({ id }: { id: string }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const iconRef = useRef<HTMLSpanElement>(null)
  const lang = useStore((s) => s.lang)
  const content: HintContent | undefined = hintsContent[lang]?.[id]

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('scroll', close, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!content) return null

  const place = () => {
    const r = iconRef.current?.getBoundingClientRect()
    if (!r) return
    const vh = window.innerHeight
    const maxH = Math.min(460, vh - 24)
    let left = r.right + 10
    if (left + POP_W > window.innerWidth - 8) left = Math.max(8, r.left - POP_W - 10)
    let top = Math.min(r.top - 10, vh - maxH - 12)
    if (top < 8) top = 8
    setPos({ left, top })
  }

  return (
    <span
      ref={iconRef}
      className="hint-icon"
      role="button"
      tabIndex={0}
      aria-label={content.title}
      onMouseEnter={() => {
        place()
        setOpen(true)
      }}
      onMouseLeave={() => setOpen(false)}
      onClick={(e) => {
        e.stopPropagation()
        place()
        setOpen((v) => !v)
      }}
    >
      ?
      {open &&
        pos &&
        createPortal(
          <div className="hint-pop" style={{ left: pos.left, top: pos.top, maxWidth: POP_W }} onMouseLeave={() => setOpen(false)}>
            <div className="hint-title">{content.title}</div>
            {content.formula && <div className="hint-formula">{content.formula}</div>}
            {content.body.map((p, i) => (
              <p key={i} dangerouslySetInnerHTML={{ __html: p }} />
            ))}
            {content.list && (
              <ul>
                {content.list.map((li, i) => (
                  <li key={i} dangerouslySetInnerHTML={{ __html: li }} />
                ))}
              </ul>
            )}
          </div>,
          document.body,
        )}
    </span>
  )
}
