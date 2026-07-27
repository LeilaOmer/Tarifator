import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Vitest nu citeste `paths` din tsconfig.json. Fara aliasul de mai jos, orice
// fisier care importa `@/lib/...` nu poate fi testat deloc — testul cade la
// incarcare, nu la o asertiune. Efect secundar de evitat: se ajungea sa fie
// testat doar codul FARA importuri interne, adica exact codul cel mai izolat.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
})
