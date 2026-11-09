import type { NextConfig } from 'next';

/**
 * Uploads shell out to the `asc` and `gplay` CLIs rather than calling the
 * Apple and Google APIs from this process, so there are no Node externals to
 * keep unbundled and no TLS to relax. If a corporate proxy breaks an upload,
 * it breaks it inside those CLIs, and that is where to fix it.
 *
 * The one setting is the body size below.
 */
const nextConfig: NextConfig = {
  experimental: {
    // Next cuts the body of a request `src/middleware.ts` sees at this size,
    // 10 MB unless set, and hands the route the first part only. A screenshot
    // upload sends a whole locale as base64 in one JSON body, 13 to 16 MB for
    // an iPad or Android phone locale, so this leaves room for sets several
    // times larger. Next keeps a second copy of the body for the middleware,
    // so an upload costs about twice its size in memory while it is read.
    // Next 16 renames this `proxyClientMaxBodySize`.
    middlewareClientMaxBodySize: '200mb',
  },
};

export default nextConfig;
