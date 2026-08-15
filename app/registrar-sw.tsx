'use client'
import { useEffect } from 'react'

export default function RegistrarServiceWorker() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Si falla el registro (ej. navegador viejo), la página sigue
        // funcionando normal, simplemente sin las ventajas de la PWA.
      })
    }
  }, [])

  return null
}
