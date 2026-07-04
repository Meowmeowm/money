// 无依赖生成 PNG 图标：豆沙紫渐变底 + 白色硬币开槽图形
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function crc32(buf) {
  let c
  const table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const b of buf) crc = (table[(crc ^ b) & 0xff] ^ (crc >>> 8)) >>> 0
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(size, pixelFn) {
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelFn(x, y, size)
      const off = y * (size * 4 + 1) + 1 + x * 4
      raw[off] = r
      raw[off + 1] = g
      raw[off + 2] = b
      raw[off + 3] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const smooth = (edge, d) => Math.max(0, Math.min(1, (edge - d) + 0.5)) // 1px AA
const mix = (a, b, t) => Math.round(a + (b - a) * t)

function iconPixel(x, y, S) {
  const cx = S / 2
  const cy = S / 2
  // 渐变底：左上亮紫 → 右下深紫
  const t = (x + y) / (2 * S)
  let r = mix(0x92, 0x68, t)
  let g = mix(0x84, 0x5a, t)
  let b = mix(0xc4, 0x9c, t)
  const dist = Math.hypot(x - cx, y - cy * 0.98)
  const coinR = S * 0.3
  const coin = smooth(coinR, dist)
  // 硬币投币槽：白圆上的横向圆角条
  const slotW = S * 0.17
  const slotH = S * 0.045
  const dx = Math.max(0, Math.abs(x - cx) - slotW)
  const dy = Math.max(0, Math.abs(y - cy * 0.98) - slotH)
  const slot = smooth(slotH * 0.6, Math.hypot(dx, dy) - slotH * 0.4)
  const white = coin * (1 - slot)
  r = mix(r, 0xff, white)
  g = mix(g, 0xff, white)
  b = mix(b, 0xfd, white)
  return [r, g, b, 255]
}

mkdirSync(join(root, 'public/icons'), { recursive: true })
for (const [name, size] of [
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
]) {
  writeFileSync(join(root, 'public/icons', name), png(size, iconPixel))
  console.log('generated', name)
}
