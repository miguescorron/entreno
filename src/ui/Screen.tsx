import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from './Icon'
import { springFast } from './motion'

interface ScreenProps {
  title: string
  eyebrow?: ReactNode
  accessory?: ReactNode
  back?: string
  tabbar?: boolean
  children: ReactNode
}

/** Pantalla con título grande; al hacer scroll aparece una barra translúcida compacta. */
export function Screen({ title, eyebrow, accessory, back, tabbar = true, children }: ScreenProps) {
  const [compact, setCompact] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > 52)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <>
      <AnimatePresence>
        {compact && (
          <motion.div className="nav-compact" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={springFast}>
            <span className="t-headline">{title}</span>
          </motion.div>
        )}
      </AnimatePresence>
      {back && (
        <button className="nav-back t-body" onClick={() => navigate(back)}>
          <Icon name="chevronLeft" size={24} strokeWidth={2.2} />
          Atrás
        </button>
      )}
      <main className={`screen ${tabbar ? '' : 'no-tabbar'}`}>
        <header className="screen-header">
          <div className="grow">
            {eyebrow && <div className="eyebrow t-sub muted">{eyebrow}</div>}
            <h1 className="t-large-title" style={{ margin: 0 }}>
              {title}
            </h1>
          </div>
          {accessory}
        </header>
        {children}
      </main>
    </>
  )
}
