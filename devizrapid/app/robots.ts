import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/demo', '/termeni', '/confidentialitate', '/retragere'],
        disallow: ['/dashboard', '/quotes', '/quick', '/pricing', '/services', '/clients', '/settings', '/upgrade', '/api/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
