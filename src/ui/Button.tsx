import { motion, useReducedMotion, type HTMLMotionProps } from 'motion/react'
import { pressTransition } from './motion'

type Props = HTMLMotionProps<'button'> & { variant?: string }

/** Botón con respuesta inmediata al tocar (escala al pulsar, no al soltar). */
export function Button({ variant = '', className = '', ...rest }: Props) {
  const reduce = useReducedMotion()
  return (
    <motion.button
      type="button"
      className={`btn ${variant} ${className}`}
      whileTap={reduce ? { opacity: 0.6 } : { scale: 0.96, opacity: 0.85 }}
      transition={pressTransition}
      {...rest}
    />
  )
}

export function Pressable({ className = '', ...rest }: HTMLMotionProps<'button'>) {
  const reduce = useReducedMotion()
  return (
    <motion.button
      type="button"
      className={className}
      whileTap={reduce ? { opacity: 0.6 } : { scale: 0.98, opacity: 0.9 }}
      transition={pressTransition}
      {...rest}
    />
  )
}
