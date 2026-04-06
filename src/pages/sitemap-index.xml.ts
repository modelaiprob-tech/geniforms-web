import type { APIRoute } from 'astro';

const pages = [
  { url: 'https://geniforms.es/', priority: '1.0', changefreq: 'weekly' },
  { url: 'https://geniforms.es/pricing', priority: '0.8', changefreq: 'monthly' },
  { url: 'https://geniforms.es/privacy', priority: '0.3', changefreq: 'yearly' },
  { url: 'https://geniforms.es/terms', priority: '0.3', changefreq: 'yearly' },
  { url: 'https://geniforms.es/cookies', priority: '0.3', changefreq: 'yearly' },
];

const today = new Date().toISOString().split('T')[0];

export const GET: APIRoute = () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(p => `  <url>
    <loc>${p.url}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=86400',
    },
  });
};
