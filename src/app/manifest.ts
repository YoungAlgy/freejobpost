import type { MetadataRoute } from 'next'

// PWA web app manifest. Gives freejobpost.co an installable identity (name,
// short_name, brand theme color) and points at the dynamically generated brand
// icons (/icon, /apple-icon, /icon-512). Next.js serves this at
// /manifest.webmanifest and auto-injects the <link rel="manifest"> in <head>.
//
// theme_color = Ava Health navy (#003D5C), matching the favicon + apple-icon
// background so the PWA splash + install chrome read as one brand. The
// browser-chrome <meta name="theme-color"> is deliberately NOT set here — that
// belongs in layout.tsx's viewport export so the in-flight light/dark theme
// work can make it media-query aware.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Ava Health Jobs',
    short_name: 'Ava Jobs',
    description:
      'Post healthcare jobs for free. No auction fees, no paywall, no recruiter spam.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#003D5C',
    icons: [
      { src: '/icon', sizes: '32x32', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
      { src: '/icon-512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
