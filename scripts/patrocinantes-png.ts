// npx tsx scripts/patrocinantes-png.ts — convierte public/patrocinantes/*.webp a
// public/patrocinantes/png/*.png para las piezas de difusión: next/og no dibuja
// .webp. Correrlo al agregar un logo a esa carpeta (un test lo exige).

import { mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

const origen = 'public/patrocinantes'
const destino = join(origen, 'png')
mkdirSync(destino, { recursive: true })

async function main() {
  for (const archivo of readdirSync(origen).filter((f) => f.endsWith('.webp'))) {
    const salida = join(destino, archivo.replace('.webp', '.png'))
    await sharp(join(origen, archivo)).resize({ width: 300, height: 150, fit: 'inside', withoutEnlargement: true }).png({ compressionLevel: 9 }).toFile(salida)
    console.log('✔', salida)
  }
}

main()
