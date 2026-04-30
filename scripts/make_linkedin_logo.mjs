#!/usr/bin/env node
// One-shot: render a 1024x1024 brutalist square PNG for the LinkedIn
// Company Page logo. Matches the freejobpost.co brand (black bg, white
// wordmark, #15803d green underline + ".co" accent).
//
// Output: scripts/freejobpost-logo-1024.png
//
// Usage: node scripts/make_linkedin_logo.mjs

import sharp from 'sharp'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#000000"/>
  <!-- Big FJP wordmark -->
  <text x="512" y="510"
        font-family="Helvetica Neue, Arial Black, sans-serif"
        font-weight="900"
        font-size="420"
        fill="#FFFFFF"
        text-anchor="middle"
        letter-spacing="-20"
        dominant-baseline="middle">fjp</text>
  <!-- Green underline bar -->
  <rect x="180" y="700" width="664" height="32" fill="#15803d"/>
  <!-- freejobpost.co subline -->
  <text x="512" y="800"
        font-family="Helvetica Neue, Arial Black, sans-serif"
        font-weight="800"
        font-size="68"
        fill="#FFFFFF"
        text-anchor="middle"
        letter-spacing="-1"
        dominant-baseline="middle">freejobpost<tspan fill="#15803d">.co</tspan></text>
</svg>
`

const outPath = join(__dirname, 'freejobpost-logo-1024.png')

await sharp(Buffer.from(svg))
  .png({ compressionLevel: 9 })
  .toFile(outPath)

console.log(`Wrote ${outPath}`)
