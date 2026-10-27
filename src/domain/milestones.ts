// Hitos de la spec §6. La evaluación por reglas llega en la Fase D;
// aquí solo están las definiciones para mostrarlas en el plan.

export interface MilestoneDef {
  key: string
  title: string
  week: number
  criteria: string[]
  weightRange?: [number, number]
}

export const MILESTONES: MilestoneDef[] = [
  {
    key: 'H0',
    title: 'Listo para empezar',
    week: 0,
    criteria: ['Chequeo médico con prueba de esfuerzo', 'Zapatillas de running y gafas de natación'],
  },
  {
    key: 'H1',
    title: 'Hábito creado',
    week: 4,
    criteria: ['4 semanas con ≥ 85 % de sesiones hechas', '400 m de natación acumulando con pausas'],
    weightRange: [85, 86],
  },
  {
    key: 'H2',
    title: 'Primeros continuos',
    week: 8,
    criteria: ["10' de trote continuo", "Bici 60-70' en zona 2", '400 m de natación seguidos'],
    weightRange: [83, 85],
  },
  {
    key: 'H3',
    title: 'Fin de la Base',
    week: 12,
    criteria: ["Test: 20' de carrera continua", "Bici 100-110'", '800 m de natación seguidos'],
    weightRange: [81, 83],
  },
  {
    key: 'H4',
    title: 'Fin de Construcción I',
    week: 24,
    criteria: ['6-7 km de carrera continua', 'Bici 2 h 30 (≈ 55-60 km)', '1.500 m de natación seguidos'],
    weightRange: [77, 80],
  },
  {
    key: 'H5',
    title: 'Fin de Construcción II',
    week: 36,
    criteria: ['12 km de carrera', 'Bici 3 h 15 (≈ 75 km)', '1.900 m en piscina + 1 km en aguas abiertas'],
    weightRange: [75, 78],
  },
  {
    key: 'H6',
    title: 'Simulacro de pico',
    week: 46,
    criteria: ['Brick: bici 85-90 km + 3-5 km de carrera', 'Carrera larga de 16-18 km', 'Natación 2.000-2.200 m'],
  },
  { key: 'META', title: 'ICAN Gandía 70.3', week: 51, criteria: ['Terminar sano'] },
]

export interface PrepEvent {
  title: string
  weeks: [number, number]
}

export const PREP_EVENTS: PrepEvent[] = [
  { title: 'Carrera de 10 km', weeks: [22, 28] },
  { title: 'Triatlón sprint o supersprint', weeks: [30, 34] },
  { title: 'Natación en aguas abiertas ≥ 1 km', weeks: [28, 35] },
]
