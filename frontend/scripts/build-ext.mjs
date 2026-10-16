// Сборка расширения Kinora Sync: dist-ext/ + архив public/kinora-extension.zip (его раздаёт сайт).
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zipSync } from 'fflate'
import { build } from 'vite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'src/ext')
const out = join(root, 'dist-ext')
const SITE = process.env.KINORA_SITE || 'https://kinozal-production.up.railway.app'

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

for (const name of ['content', 'background', 'popup']) {
  await build({
    configFile: false,
    publicDir: false,
    logLevel: 'warn',
    define: { __SITE__: JSON.stringify(SITE) },
    build: {
      outDir: out,
      emptyOutDir: false,
      minify: true,
      lib: { entry: join(src, `${name}.ts`), formats: ['iife'], name: `kinora_${name}`, fileName: () => `${name}.js` },
    },
  })
}

cpSync(join(src, 'manifest.json'), join(out, 'manifest.json'))
cpSync(join(src, 'popup.html'), join(out, 'popup.html'))
cpSync(join(src, 'icons'), join(out, 'icons'), { recursive: true })

// Архив для скачивания с сайта
const files = {}
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p)
    else files[`kinora-extension/${relative(out, p).replaceAll('\\', '/')}`] = new Uint8Array(readFileSync(p))
  }
}
walk(out)
mkdirSync(join(root, 'public'), { recursive: true })
writeFileSync(join(root, 'public/kinora-extension.zip'), zipSync(files, { level: 9 }))
console.log(`extension built for ${SITE}: ${Object.keys(files).length} files → public/kinora-extension.zip`)
