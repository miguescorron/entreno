import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'
import { applyTheme, getTheme } from './lib/theme'

applyTheme(getTheme())

// Pide al navegador que no borre los datos locales (IndexedDB) aunque falte espacio.
navigator.storage?.persist?.().catch(() => {})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
