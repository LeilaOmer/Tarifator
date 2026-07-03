import React from 'react'
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import ActiveCompanyBanner from './components/ActiveCompanyBanner'
import CookieBanner from './components/CookieBanner'

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL('https://devizele-mele.vercel.app'),
  title: {
    default: 'Tarifator – Raspunsul la „Cat costa?" | Fisa Servicii & Calculator Pret',
    template: '%s | Tarifator',
  },
  description: 'Raspunsul instant la „cat costa?" — fisa de servicii prin dictare vocala pentru prestatori (electricieni, instalatori, mecanici, coafori) si calculator pret cu adaos si TVA pentru comercianti. Plan gratuit permanent, fara card.',
  keywords: [
    // fise servicii — domenii
    'fisa servicii', 'fisa servicii', 'bon de lucru', 'bon manopera', 'raport de lucru',
    'electrician', 'instalator', 'instalatii sanitare', 'instalatii termice', 'instalatii gaz',
    'frigotehnist', 'aer conditionat', 'climatizare', 'HVAC', 'ventilatie', 'pompe de caldura',
    'zugrav', 'zugravit', 'zugravitor', 'vopsitor', 'faiantar', 'gresist', 'rigipsar',
    'tamplar', 'tamplarie', 'montaj ferestre', 'lacatus', 'sudor', 'acoperisuri', 'izolator',
    'mecanic auto', 'service auto', 'vopsitor auto', 'tinichigiu', 'electrician auto',
    'curatenie', 'curatenie birouri', 'spalatorie', 'dezinsectie', 'deratizare',
    'coafor', 'frizerie', 'manichiura', 'pedichiura', 'nail art', 'epilare', 'cosmetica',
    'masaj', 'maseur', 'kinetoterapie', 'fizioterapie', 'antrenor personal', 'nutritionist',
    'reparatii telefoane', 'reparatii calculatoare', 'service IT', 'mentenanta IT',
    'contabil', 'contabilitate', 'expert contabil', 'consultant fiscal', 'avocat',
    'meditatii', 'instructor auto', 'fotograf', 'cameraman', 'traducator', 'gradinarit',
    'prestator servicii', 'artizan', 'aplicatie artizan', 'aplicatie prestatori',
    // calculator pret — tipuri comercianti
    'calculator pret vanzare', 'calculator adaos comercial', 'calculator TVA', 'calculator marja profit',
    'calcul markup', 'calcul adaos', 'pret de vanzare',
    'magazin', 'boutique', 'grossist', 'angrosist', 'en-gros', 'importator', 'distribuitor',
    'producator', 'revanzator', 'reseller', 'dropshipping',
    'produse alimentare', 'non-alimentar', 'fashion', 'imbracaminte', 'cosmetice',
    'electronice', 'electrocasnice', 'materiale constructii', 'piese auto', 'bijuterii', 'mobilier',
    // general
    'Tarifator', 'Romania', 'TVA 11', 'TVA 21',
  ],
  authors: [{ name: 'Tarifator' }],
  creator: 'Tarifator',
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    locale: 'ro_RO',
    url: 'https://devizele-mele.vercel.app',
    siteName: 'Tarifator',
    title: 'Tarifator – Raspunsul la „Cat costa?"',
    description: '„Cat costa?" — raspunsul in secunde. Fisa servicii prin dictare vocala pentru prestatori + calculator pret cu adaos si TVA pentru comercianti. Plan gratuit permanent.',
  },
  twitter: {
    card: 'summary',
    title: 'Tarifator – Raspunsul la „Cat costa?"',
    description: 'Fisa servicii prin dictare + calculator pret cu adaos si TVA. Raspunsul instant la „cat costa?" pentru prestatori si comercianti. Plan gratuit permanent.',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Tarifator',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ro" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="theme-color" content="#002b5b" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="google-site-verification" content="1oT_kVaquGCv5mRyuLehEXtvVb05ICwJ8ToNfDAqs84" />
      </head>
      <body className="h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'))
          }
        `}} />
        <ActiveCompanyBanner />
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
        <CookieBanner />
      </body>
    </html>
  );
}