import type { MetadataRoute } from 'next'

// PWA web app manifest. Gives freejobpost.co an installable identity (name,
// short_name, brand theme color) and points at the dynamically generated brand
// icons (/icon, /apple-icon, /icon-512). Next.js serves this at
// /manifest.webmanifest and auto-injects the <link rel="manifest"> in <head>.
//
// theme_color matches the independent FreeJobPost posting-card mark.
// background so the PWA splash + install chrome read as one brand. The
// browser-chrome <meta name="theme-color"> is deliberately NOT set here — that
// belongs in layout.tsx's viewport export so the in-flight light/dark theme
// work can make it media-query aware.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'FreeJobPost',
    short_name: 'FreeJobPost',
    description:
      'Post and find nursing and allied health jobs.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#17324D',
    icons: [
      { src: '/icon', sizes: '32x32', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
      { src: '/icon-512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
