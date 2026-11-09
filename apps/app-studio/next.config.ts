import type { NextConfig } from 'next';

/**
 * Uploads shell out to the `asc` and `gplay` CLIs rather than calling the
 * Apple and Google APIs from this process, so there is nothing here to
 * configure: no Node externals to keep unbundled, and no TLS to relax. If a
 * corporate proxy breaks an upload, it breaks it inside those CLIs, and that
 * is where to fix it.
 */
const nextConfig: NextConfig = {
  experimental: {
    // A request that passes through `src/middleware.ts` has its body cut at
    // this size, 10 MB by default, and `req.json()` then fails on the half it
    // got. An upload sends a whole locale's screenshots as base64 in one JSON
    // body: an iPad or Android phone locale is 13 to 16 MB, and ten large
    // exports can pass 50 MB.
    middlewareClientMaxBodySize: 200 * 1024 * 1024,
  },
};

export default nextConfig;
