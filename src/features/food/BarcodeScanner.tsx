import { BarcodeDetector, setZXingModuleOverrides } from 'barcode-detector/ponyfill'
import { useEffect, useRef, useState } from 'react'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'
import { Button } from '../../ui/Button'

// El lector (WebAssembly) va empaquetado con la app: funciona sin depender de un CDN.
setZXingModuleOverrides({ locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) })

/** Cámara trasera + detección continua de EAN/UPC. Llama a onCode una sola vez. */
export function BarcodeScanner({ onCode }: { onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [manual, setManual] = useState('')
  const done = useRef(false)

  useEffect(() => {
    let stream: MediaStream | undefined
    let raf = 0
    let stopped = false
    const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] })

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        if (stopped) return
        const v = video.current!
        v.srcObject = stream
        await v.play()
        const tick = async () => {
          if (stopped || done.current) return
          try {
            const codes = await detector.detect(v)
            if (codes[0]?.rawValue && !done.current) {
              done.current = true
              onCode(codes[0].rawValue)
              return
            }
          } catch {
            /* fotograma no listo */
          }
          raf = window.setTimeout(tick, 150)
        }
        tick()
      } catch {
        setError('No puedo usar la cámara. Revisa el permiso en Ajustes de iOS o escribe el código.')
      }
    }
    start()
    return () => {
      stopped = true
      window.clearTimeout(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [onCode])

  return (
    <div className="stack">
      {!error && (
        <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', background: '#000', aspectRatio: '4 / 3' }}>
          <video ref={video} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          <div aria-hidden style={{ position: 'absolute', left: '12%', right: '12%', top: '38%', bottom: '38%', border: '2px solid rgba(255,255,255,.85)', borderRadius: 12 }} />
        </div>
      )}
      {error && <div className="banner">{error}</div>}
      <div className="t-foot muted" style={{ textAlign: 'center' }}>Centra el código de barras en el recuadro</div>
      <div className="row">
        <input className="input num grow" inputMode="numeric" placeholder="O escribe el código" value={manual} onChange={(e) => setManual(e.target.value.replace(/\D/g, ''))} />
        <Button variant="tinted" disabled={manual.length < 8} onClick={() => onCode(manual)}>
          Buscar
        </Button>
      </div>
    </div>
  )
}
