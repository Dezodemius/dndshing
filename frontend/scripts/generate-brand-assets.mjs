// Rebuilds public/ favicon assets from the master mark in src/assets/brand.
// Run after replacing src/assets/brand/mark.png: npm run brand:generate
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const rootDir = dirname(fileURLToPath(import.meta.url))
const frontendDir = resolve(rootDir, '..')
const markPath = resolve(frontendDir, 'src/assets/brand/mark.png')
const publicDir = resolve(frontendDir, 'public')

// The master art is a full-bleed rounded square drawn on an opaque backdrop.
// We re-cut the corners into the alpha channel so the icon does not show white
// notches on dark tab bars / launchers.
const CORNER_RADIUS_RATIO = 0.176

// Sizes embedded in favicon.ico (kept small: covers classic taskbar/tab use).
const ICO_SIZES = [16, 32, 48]
// Standalone PNGs referenced from index.html / the web manifest.
// iOS ignores alpha on the home-screen icon and applies its own mask, so that
// one is flattened onto the brand backdrop instead of shipping cut corners.
const BRAND_BACKDROP = '#16141c'
const PNG_TARGETS = [
  { size: 32, file: 'favicon-32x32.png' },
  { size: 180, file: 'apple-touch-icon.png', opaque: true },
  { size: 192, file: 'icon-192.png' },
  { size: 512, file: 'icon-512.png' },
]

function buildIco(pngBuffers) {
  // ICO container holding PNG-compressed frames (supported by all modern
  // consumers); avoids pulling in an image-conversion dependency.
  const count = pngBuffers.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(count, 4)

  let offset = 6 + count * 16
  const dirEntries = []
  for (const { size, data } of pngBuffers) {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0) // width (0 == 256px)
    entry.writeUInt8(size >= 256 ? 0 : size, 1) // height
    entry.writeUInt8(0, 2) // palette
    entry.writeUInt8(0, 3) // reserved
    entry.writeUInt16LE(1, 4) // color planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(data.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += data.length
    dirEntries.push(entry)
  }

  return Buffer.concat([header, ...dirEntries, ...pngBuffers.map((p) => p.data)])
}

async function loadMark() {
  const source = await readFile(markPath)
  const { width, height } = await sharp(source).metadata()
  const radius = Math.round(Math.min(width, height) * CORNER_RADIUS_RATIO)
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<rect width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
  )
  return sharp(source)
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer()
}

async function main() {
  await mkdir(publicDir, { recursive: true })
  const mark = await loadMark()
  const render = (size, opaque = false) => {
    const image = sharp(mark).resize(size, size, { kernel: 'lanczos3' })
    return (opaque ? image.flatten({ background: BRAND_BACKDROP }) : image).png().toBuffer()
  }

  const icoFrames = await Promise.all(
    ICO_SIZES.map(async (size) => ({ size, data: await render(size) })),
  )
  await writeFile(resolve(publicDir, 'favicon.ico'), buildIco(icoFrames))

  for (const { size, file, opaque } of PNG_TARGETS) {
    await writeFile(resolve(publicDir, file), await render(size, opaque))
  }

  const manifest = {
    name: 'ДнДэшинг',
    short_name: 'ДнДэшинг',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    theme_color: '#16141c',
    background_color: '#16141c',
    display: 'standalone',
  }
  await writeFile(resolve(publicDir, 'site.webmanifest'), `${JSON.stringify(manifest, null, 2)}\n`)

  console.log('Brand assets written to', publicDir)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
