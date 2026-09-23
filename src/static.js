import { readFile } from 'node:fs/promises';

// Explicit allowlist: no user-controlled filesystem paths, backend files or .env.
const files = new Map([
  ['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']],
  ...['app.js', 'api.js', 'i18n.js'].map(name => [`/${name}`, [name, 'text/javascript']]),
  ['/styles.css', ['styles.css', 'text/css']],
  ...[640, 960, 1536].map(size => [`/assets/hero-${size}.svg`, [`assets/hero-${size}.svg`, 'image/svg+xml']]),
]);
export async function serveStatic(req, res) {
  const path = req.url.split('?')[0];
  const file = files.get(path);
  if (!file || !['GET', 'HEAD'].includes(req.method)) return false;
  const content = await readFile(new URL(`../public/${file[0]}`, import.meta.url));
  res.writeHead(200, {
    'Content-Type': `${file[1]}; charset=utf-8`, 'Content-Length': content.length,
    'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    'Referrer-Policy': 'same-origin',
  });
  res.end(req.method === 'HEAD' ? undefined : content);
  return true;
}
