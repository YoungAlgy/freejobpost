#!/usr/bin/env node
// One-shot: render a 1128x191 brutalist banner PNG for the LinkedIn
// Company Page cover. Brand-matched (black bg, white wordmark, green-700
// #15803d underline + ".co" accent). Wide format — fits a tagline + CTA.
//
// LinkedIn page banner spec: 1128x191 recommended, 1192x220 maximum.
// Max file size 4MB, JPG/PNG/GIF. We render at 1128x191 exactly.
//
// Output: scripts/freejobpost-banner-1128x191.png
//
// Usage: node scripts/make_linkedin_banner.mjs

import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const W = 1128
const H = 191

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#000000"/>

  <!-- Diagonal green accent stripe in the top-right corner -->
  <polygon points="${W - 280},0 ${W},0 ${W},80 ${W - 200},80" fill="#15803d"/>

  <!-- Main wordmark, left side -->
  <text x="60" y="92"
        font-family="Helvetica Neue, Arial Black, sans-serif"
        font-weight="900"
        font-size="64"
        fill="#FFFFFF"
        letter-spacing="-2"
        dominant-baseline="middle">freejobpost<tspan fill="#15803d">.co</tspan></text>

  <!-- Green underline bar under wordmark -->
  <rect x="60" y="116" width="540" height="6" fill="#15803d"/>

  <!-- Tagline -->
  <text x="60" y="160"
        font-family="Helvetica Neue, Arial, sans-serif"
        font-weight="500"
        font-size="22"
        fill="#A8A8A8"
        letter-spacing="0"
        dominant-baseline="middle">Free healthcare jobs. No Indeed tax. No auction fees. No paywall.</text>

  <!-- Right-side CTA chip -->
  <rect x="${W - 220}" y="120" width="180" height="44" fill="#FFFFFF"/>
  <text x="${W - 130}" y="142"
        font-family="Helvetica Neue, Arial Black, sans-serif"
        font-weight="900"
        font-size="16"
        fill="#000000"
        text-anchor="middle"
        letter-spacing="1"
        dominant-baseline="middle">POST A JOB FREE</text>
</svg>
`

const outPath = join(__dirname, `freejobpost-banner-${W}x${H}.png`)

await sharp(Buffer.from(svg))
  .png({ compressionLevel: 9 })
  .toFile(outPath)

console.log(`Wrote ${outPath}`)
