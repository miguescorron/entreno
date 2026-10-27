import { AnimatePresence, motion } from 'motion/react'
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { spring } from './motion'

interface ToastData {
  id: number
  text: string
  action?: { label: string; run: () => void }
}

const ToastCtx = createContext<(text: string, action?: ToastData['action']) => void>(() => {})

/** Confirmación breve con opción de deshacer (feedback de "completado"). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastData | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const show = useCallback((text: string, action?: ToastData['action']) => {
    window.clearTimeout(timer.current)
    setToast({ id: Date.now(), text, action })
    timer.current = window.setTimeout(() => setToast(null), 4000)
  }, [])

  return (
    <ToastCtx.Provider value={show}>
      {children}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            className="toast"
            role="status"
            initial={{ opacity: 0, y: 24, x: '-50%', scale: 0.96 }}
            animate={{ opacity: 1, y: 0, x: '-50%', scale: 1 }}
            exit={{ opacity: 0, y: 24, x: '-50%', scale: 0.96 }}
            transition={spring}
          >
            {toast.text}
            {toast.action && (
              <button
                className="btn small tinted"
                onClick={() => {
                  toast.action!.run()
                  setToast(null)
                }}
              >
                {toast.action.label}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)
