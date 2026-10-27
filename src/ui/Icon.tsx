import type { CSSProperties } from 'react'

// Iconos de trazo al estilo SF Symbols (dibujados a mano, 24×24).
const PATHS = {
  today: 'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  plan: 'M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-11zM4 9h16M8 2.5v3M16 2.5v3M8 13h2M14 13h2M8 16.5h2',
  food: 'M7 3v7a2 2 0 0 0 2 2v9M11 3v7a2 2 0 0 1-2 2M9 3v6M16.5 21V3c-2 1-3 3.5-3 7 0 2 1 3 3 3',
  progress: 'M4 20h16M6.5 16v-4M11 16V8M15.5 16v-6M20 16V5',
  coach: 'M20 11.5c0 4.1-3.6 7.5-8 7.5-1.2 0-2.3-.2-3.3-.6L4 20l1.3-3.6C4.5 15 4 13.3 4 11.5 4 7.4 7.6 4 12 4s8 3.4 8 7.5z',
  gear: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7 7 0 0 1-2 1.2L14.8 21h-4l-.3-2.4a7 7 0 0 1-2-1.2l-2 .7-2-3.4 1.6-1.2a7 7 0 0 1 0-2.4L4.5 9.9l2-3.4 2 .7a7 7 0 0 1 2-1.2L10.8 3h4l.3 2.1a7 7 0 0 1 2 1.2l1.9-.7 2 3.4-1.6 1.1a7 7 0 0 1 0 2.4z',
  chevronRight: 'M9 5l7 7-7 7',
  chevronLeft: 'M15 5l-7 7 7 7',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  close: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  move: 'M8 7l-4 5 4 5M16 7l4 5-4 5M4 12h16',
  scale: 'M5 20h14a1 1 0 0 0 1-1l-1.5-12A1 1 0 0 0 17.5 6h-11a1 1 0 0 0-1 1L4 19a1 1 0 0 0 1 1zM12 9.5l2-2M9 10a3 3 0 0 1 6 0',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  warning: 'M12 4l9 16H3L12 4zM12 10v4M12 17v.5',
  bolt: 'M13 3L5 13.5h6L10 21l9-11h-6l1-7z',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  camera: 'M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-9zM12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21',
  barcode: 'M4 6v12M7 6v12M10 6v12M13.5 6v12M16 6v12M20 6v12M3 4h3M18 4h3M3 20h3M18 20h3',
  label: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM8 7h8M8 10.5h8M8 14h5M8 17.5h3',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5 20 20',
  drop: 'M12 3.5s-6 6.6-6 10.9a6 6 0 0 0 12 0C18 10.1 12 3.5 12 3.5z',
  trash: 'M5 7h14M10 4h4M7 7l1 12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-12',
  send: 'M12 19V5M5.5 11.5 12 5l6.5 6.5',
  // deportes
  swim: 'M3 17c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1M8 13l3-3-2-2.5L12.5 5M15.5 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM11 10l4 3',
  bike: 'M6 17.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM18 17.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM6 14l3.5-6H14M9 8l3 6h-6M12 14l3-6.5h2M14 5h2',
  run: 'M14.5 5.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM7 21l3-5 3 2v4M10 16l1-6-3 1-2 3M11 10l3 3 3-1M11 10l2.5-2.5',
  walk: 'M13 5.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM9 21l2.5-6 2 2v4M11.5 15l.5-6-3 2v3M12 9l2 3h3',
  strength: 'M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10',
  brick: 'M4 7h7v5H4zM13 7h7v5h-7zM8.5 12h7v5h-7z',
  race: 'M5 21V4M5 4h11l-2 4 2 4H5',
  other: 'M12 8v8M8 12h8',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 22, strokeWidth = 1.8, style, className }: { name: IconName; size?: number; strokeWidth?: number; style?: CSSProperties; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
