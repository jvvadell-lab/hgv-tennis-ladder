import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// El alias de tsconfig, para los tests que importan código de servidor.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
})
