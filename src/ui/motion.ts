import type { Transition } from 'motion/react'

// Springs al estilo Apple: damping 1.0 por defecto (sin rebote);
// un poco de rebote solo cuando el gesto lleva inercia.
export const spring: Transition = { type: 'spring', bounce: 0, duration: 0.4 }
export const springFast: Transition = { type: 'spring', bounce: 0, duration: 0.3 }
export const springMomentum: Transition = { type: 'spring', bounce: 0.15, duration: 0.35 }
export const pressTransition: Transition = { type: 'spring', bounce: 0, duration: 0.18 }

/** Proyección de inercia (sample code de "Designing Fluid Interfaces"). */
export function project(velocity: number, decelerationRate = 0.998) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate)
}

/** Rubber-band: cuanto más te pasas del límite, menos sigue al dedo. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot))
}
