import { NextRequest, NextResponse } from 'next/server';

/**
 * The API routes delete and write files on this Mac and push to the live store
 * listings, so only the studio's own page may call them.
 *
 * - The Host must be this machine. A name that resolves to 127.0.0.1 (DNS
 *   rebinding) or a LAN address carries some other Host and is refused.
 * - A browser request must come from this same origin. Any other web page the
 *   owner has open while the studio runs is refused, whatever it sends.
 * - A write must be JSON. A cross-site page can only send JSON after a CORS
 *   preflight, which nothing here answers, so a blind `text/plain` POST that
 *   `req.json()` would otherwise parse never reaches a route.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function middleware(req: NextRequest) {
  const host = req.headers.get('host') ?? '';
  if (!LOCAL_HOSTS.has(host.replace(/:\d+$/, ''))) return refuse('host');

  const origin = req.headers.get('origin');
  if (origin && origin !== `http://${host}`) return refuse('origin');

  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return refuse('cross-site');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const type = req.headers.get('content-type') ?? '';
    if (!type.toLowerCase().startsWith('application/json')) return refuse('content-type');
  }
  return NextResponse.next();
}

function refuse(why: string) {
  return NextResponse.json({ error: `Refused: the studio API only answers its own page (${why}).` }, { status: 403 });
}

export const config = { matcher: '/api/:path*' };
