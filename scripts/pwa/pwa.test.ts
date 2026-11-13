// Checks the PWA assets: the manifest, the icons it points to and the links
// in index.html. A broken href would otherwise be hidden by Vercel's SPA
// rewrite, which answers any missing file with index.html.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const rootDir = path.join(import.meta.dirname, '..', '..')
const publicDir = path.join(rootDir, 'public')

function publicPath(href: string): string {
  return path.join(publicDir, href.replace(/^\//, ''))
}

const manifestSchema = z.object({
  name: z.string().min(1),
  short_name: z.string().min(1),
  display: z.literal('standalone'),
  start_url: z.literal('/'),
  icons: z
    .array(
      z.object({
        src: z.string().min(1),
        sizes: z.string().regex(/^\d+x\d+$/),
        type: z.literal('image/png'),
      }),
    )
    .min(1),
})

function readManifest() {
  const raw: unknown = JSON.parse(
    readFileSync(path.join(publicDir, 'manifest.webmanifest'), 'utf8'),
  )
  return manifestSchema.parse(raw)
}

async function expectOpaquePng(file: string, size: number) {
  const metadata = await sharp(file).metadata()
  expect(metadata.format).toBe('png')
  expect(metadata.width).toBe(size)
  expect(metadata.height).toBe(size)
  expect(metadata.hasAlpha).toBe(false)
}

describe('manifest.webmanifest', () => {
  it('is valid and has the 192 and 512 icons', () => {
    const manifest = readManifest()
    const sizes = manifest.icons.map((icon) => icon.sizes)
    expect(sizes).toContain('192x192')
    expect(sizes).toContain('512x512')
  })

  it('points to existing opaque PNGs of the declared size', async () => {
    for (const icon of readManifest().icons) {
      const file = publicPath(icon.src)
      expect(existsSync(file), icon.src).toBe(true)
      const size = Number(icon.sizes.split('x')[0])
      await expectOpaquePng(file, size)
    }
  })

  it('declares sizes that match both the width and the height of each PNG', async () => {
    for (const icon of readManifest().icons) {
      const { width, height } = await sharp(publicPath(icon.src)).metadata()
      expect(`${width}x${height}`, icon.src).toBe(icon.sizes)
    }
  })

  it('uses root-absolute icon src values', () => {
    for (const icon of readManifest().icons) {
      expect(icon.src, icon.src).toMatch(/^\/[^/]/)
    }
  })
})

describe('index.html', () => {
  const html = readFileSync(path.join(rootDir, 'index.html'), 'utf8')

  function linkHref(rel: string): string {
    const match = new RegExp(`<link[^>]*rel="${rel}"[^>]*>`).exec(html)
    const href = match && /href="([^"]+)"/.exec(match[0])
    if (!href?.[1]) {
      throw new Error(`index.html has no <link rel="${rel}" href>`)
    }
    return href[1]
  }

  it.each(['manifest', 'apple-touch-icon', 'icon'])(
    'links rel="%s" to an existing file',
    (rel) => {
      expect(existsSync(publicPath(linkHref(rel)))).toBe(true)
    },
  )

  // The SPA serves index.html at nested routes (/foods/123): a relative href
  // would resolve under that path and get index.html back from the rewrite.
  it.each(['manifest', 'apple-touch-icon', 'icon'])(
    'links rel="%s" with a root-absolute href',
    (rel) => {
      expect(linkHref(rel)).toMatch(/^\/[^/]/)
    },
  )

  function metaContent(name: string): string | undefined {
    const match = new RegExp(`<meta[^>]*name="${name}"[^>]*>`).exec(html)
    return match ? /content="([^"]*)"/.exec(match[0])?.[1] : undefined
  }

  it('has the iOS home screen metas (spec §14, decision 34)', () => {
    expect(metaContent('apple-mobile-web-app-capable')).toBe('yes')
    // black-translucent would hide the white clock on the white background.
    expect(metaContent('apple-mobile-web-app-status-bar-style')).toBe('default')
    expect(metaContent('apple-mobile-web-app-title')).toBe(
      readManifest().short_name,
    )
  })

  it('has a 180x180 opaque apple-touch-icon', async () => {
    await expectOpaquePng(publicPath(linkHref('apple-touch-icon')), 180)
  })

  it('lets the page extend under the notch and home indicator', () => {
    expect(html).toMatch(
      /<meta\s+name="viewport"\s+content="[^"]*viewport-fit=cover[^"]*"/,
    )
  })
})
