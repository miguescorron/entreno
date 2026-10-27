import { AnimatePresence, motion, useDragControls, useReducedMotion, type PanInfo } from 'motion/react'
import { useEffect, useRef, type ReactNode } from 'react'
import { project, spring, springMomentum } from './motion'

interface SheetProps {
  open: boolean
  onClose: () => void
  title?: string
  left?: ReactNode
  right?: ReactNode
  children: ReactNode
}

/**
 * Hoja modal que sube desde abajo y se cierra por donde vino.
 * Se arrastra 1:1 desde la cabecera; al soltar se proyecta la inercia
 * para decidir si se cierra o vuelve.
 */
export function Sheet(props: SheetProps) {
  return <AnimatePresence>{props.open && <SheetInner {...props} />}</AnimatePresence>
}

function SheetInner({ onClose, title, left, right, children }: SheetProps) {
  const reduce = useReducedMotion()
  const controls = useDragControls()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const h = ref.current?.offsetHeight ?? 600
    const projected = info.offset.y + project(info.velocity.y)
    if (projected > h * 0.45 || info.velocity.y > 900) onClose()
  }

  const variants = reduce
    ? { hidden: { opacity: 0 }, shown: { opacity: 1 } }
    : { hidden: { y: '100%' }, shown: { y: 0 } }

  return (
    <>
      <motion.div
        className="scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={reduce ? { duration: 0.2 } : spring}
        onClick={onClose}
      />
      <motion.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="sheet"
        variants={variants}
        initial="hidden"
        animate="shown"
        exit="hidden"
        transition={reduce ? { duration: 0.2 } : spring}
        drag={reduce ? false : 'y'}
        dragControls={controls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.04, bottom: 1 }}
        dragTransition={{ bounceStiffness: 400, bounceDamping: 40 }}
        dragMomentum={false}
        onDragEnd={onDragEnd}
        style={{ willChange: 'transform' }}
      >
        <div onPointerDown={(e) => controls.start(e)} style={{ touchAction: 'none' }}>
          <div className="sheet-grabber">
            <span />
          </div>
          <div className="sheet-head">
            <div>{left}</div>
            <div className="t-headline">{title}</div>
            <div>{right}</div>
          </div>
        </div>
        <motion.div className="sheet-body" transition={springMomentum}>
          {children}
        </motion.div>
      </motion.div>
    </>
  )
}
