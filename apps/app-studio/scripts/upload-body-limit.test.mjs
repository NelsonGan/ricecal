import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import nextConfig from '../next.config.ts';

const require = createRequire(import.meta.url);
// The parser Next itself reads the setting with, so '200mb' and 209715200 both work.
const bytes = require('next/dist/compiled/bytes');

// Next cuts the body of any request its middleware sees at
// `middlewareClientMaxBodySize`, 10 MB unless set, and every upload route sits
// behind `src/middleware.ts`. The largest locale measured, an iPad set, is
// about 16 MB of base64 JSON; the floor is four times that.
test('the middleware passes a whole locale upload through uncut', () => {
  const setting = nextConfig.experimental?.middlewareClientMaxBodySize;
  assert.ok(setting !== undefined, 'middlewareClientMaxBodySize is not set, so Next cuts bodies at 10 MB');
  const limit = typeof setting === 'number' ? setting : bytes.parse(setting);
  assert.ok(limit >= 64 * 1024 * 1024, `limit ${limit} bytes is below four times a large locale upload`);
});
