import type { NextConfig } from "next";

// Originea Supabase (din env) — clientul face fetch/websocket direct catre ea
// (auth + date + realtime), deci trebuie permisa explicit in connect-src.
const supabaseOrigin = (() => {
  try { const u = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || ''); return `${u.protocol}//${u.host}` } catch { return '' }
})()
const supabaseWs = supabaseOrigin.replace(/^http/, 'ws')

// Pe deploy-urile de Preview, Vercel injecteaza toolbar-ul lui de feedback de pe
// vercel.live (+ realtime via pusher). Pe PRODUCTIE nu apare, deci il permitem
// DOAR in afara productiei ca sa nu slabim CSP-ul real. VERCEL_ENV e 'production'
// / 'preview' / undefined (local) — orice != production => permitem vercel.live.
const isProd = process.env.VERCEL_ENV === 'production'
const live      = isProd ? '' : 'https://vercel.live'
const liveWs    = isProd ? '' : 'wss://ws-us3.pusher.com https://sockjs-us3.pusher.com'
const liveImg   = isProd ? '' : 'https://vercel.live https://vercel.com'
const liveFont  = isProd ? '' : 'https://vercel.live https://assets.vercel.com'

// CSP conservator: inchide clickjacking / injectie de baza (frame-ancestors,
// object-src, base-uri, form-action) si scopeaza connect/img/frame, DAR lasa
// script/style 'unsafe-inline' ca sa nu strice hidratarea Next. Testat pe Preview.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${live}`,
  `style-src 'self' 'unsafe-inline' ${live}`,
  `img-src 'self' data: blob: ${liveImg}`,
  `font-src 'self' data: ${liveFont}`,
  "worker-src 'self' blob:",
  `frame-src 'self' ${live}`,
  `connect-src 'self' ${supabaseOrigin} ${supabaseWs} ${live} ${liveWs}`,
].map(d => d.replace(/\s+/g, ' ').trim()).join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  // HSTS: fortele HTTPS 1 an. Sigur pe Vercel (serveste doar HTTPS). Fara
  // `preload` intentionat — ala e un angajament greu de scos din lista browserelor.
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
]

const nextConfig: NextConfig = {
  // pdfjs-dist + @napi-rs/canvas (randare PDF -> imagine, pentru PDF-uri scanate
  // fara text) au binare native — le lasam externe bundler-ului Next, altfel
  // risca sa fie ambalate gresit la build si sa pice doar in productie pe Vercel.
  serverExternalPackages: ['pdfjs-dist', '@napi-rs/canvas'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
};

export default nextConfig;
