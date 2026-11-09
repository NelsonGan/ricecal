import type { NextConfig } from 'next';

/**
 * Uploads shell out to the `asc` and `gplay` CLIs rather than calling the
 * Apple and Google APIs from this process, so there is nothing here to
 * configure: no Node externals to keep unbundled, and no TLS to relax. If a
 * corporate proxy breaks an upload, it breaks it inside those CLIs, and that
 * is where to fix it.
 */
const nextConfig: NextConfig = {};

export default nextConfig;
