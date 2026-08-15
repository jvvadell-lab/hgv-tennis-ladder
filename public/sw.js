// Service worker de HGV Tennis Club.
// Estrategia: "network-first" para páginas y datos (así el jugador siempre ve
// lo más reciente cuando tiene internet), y "cache-first" solo para archivos
// estáticos versionados (íconos, JS/CSS del build) — así no se queda pegado
// mostrando una versión vieja de la app después de un deploy.

const CACHE_NAME = 'hgv-tennis-v1'
const OFFLINE_URL = '/ladder'

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

function esArchivoEstatico(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.json' ||
    url.pathname === '/logo-hgv.png'
  )
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Solo manejamos peticiones GET de nuestro propio dominio.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return

  if (esArchivoEstatico(url)) {
    // Cache-first: estos archivos vienen versionados por el build de Next.js,
    // así que si ya los tenemos guardados, no hace falta pedirlos de nuevo.
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached
        return fetch(event.request).then((res) => {
          const copia = res.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia))
          return res
        })
      })
    )
    return
  }

  // Network-first para todo lo demás (páginas, datos) — solo caemos al
  // caché si de verdad no hay internet en ese momento.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copia = res.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia))
        return res
      })
      .catch(() =>
        caches.match(event.request).then((cached) => cached || caches.match(OFFLINE_URL))
      )
  )
})
