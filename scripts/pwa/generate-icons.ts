// Regenerates the PWA icons from public/icon.svg. The PNGs are committed,
// so this only needs to run when the SVG changes:
//   node scripts/pwa/generate-icons.ts
import path from 'node:path'
import sharp from 'sharp'

const publicDir = path.join(import.meta.dirname, '..', '..', 'public')
const source = path.join(publicDir, 'icon.svg')

const outputs = [
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
]

for (const { file, size } of outputs) {
  // iOS fills transparent pixels with black, so the icons carry no alpha.
  await sharp(source)
    .resize(size, size)
    .removeAlpha()
    .png()
    .toFile(path.join(publicDir, file))
}
