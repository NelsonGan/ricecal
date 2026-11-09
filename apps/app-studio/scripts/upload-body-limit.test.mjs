import assert from 'node:assert/strict';
import test from 'node:test';
import nextConfig from '../next.config.ts';

// Next cuts the body of any request its middleware sees at
// `middlewareClientMaxBodySize`, 10 MB unless set, and every upload route sits
// behind `src/middleware.ts`. One locale's screenshots, sent as base64 JSON,
// are 13 to 16 MB for an iPad or Android phone set.
test('the middleware passes a whole locale upload through uncut', () => {
  const limit = nextConfig.experimental?.middlewareClientMaxBodySize;
  assert.equal(typeof limit, 'number', 'middlewareClientMaxBodySize is not set, so Next cuts bodies at 10 MB');
  assert.ok(limit >= 64 * 1024 * 1024, `limit ${limit} bytes is below a large locale upload`);
});
