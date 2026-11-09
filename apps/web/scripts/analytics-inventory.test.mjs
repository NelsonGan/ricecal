// The README's website events table is the contract for `src/lib/analytics.ts`
// (README, *Website product analytics*). This checks that every name in
// `EVENTS` has a row and that each row's source files exist here; payloads,
// mappings and gates are still read by hand.
//
// It lives with the website, not in the app's jest suite, because a pull
// request that touches only `apps/web` runs the Web workflow and skips the
// app's. Run with `pnpm --filter @ricecal/web test`.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const web = new URL("../", import.meta.url);
const readme = readFileSync(new URL("../../README.md", web), "utf8");

// A plain object of display names rather than a typed plan, so the names are
// read straight from the source.
const events = [
  ...(readFileSync(new URL("src/lib/analytics.ts", web), "utf8")
    .split("export const EVENTS = {")[1]
    ?.split("} as const")[0]
    ?.matchAll(/^\s+\w+: "([^"]+)",$/gm) ?? []),
].map(([, name]) => name);

const table = readme
  .split("<!-- analytics-website-events:start -->")[1]
  ?.split("<!-- analytics-website-events:end -->")[0];

test("documents every website event with a source that exists in apps/web", () => {
  assert.ok(events.length > 0, "found no names in EVENTS");
  assert.ok(table, "the README has no website events table");
  const rows = table
    .split("\n")
    .filter((line) => /^\| [A-Z]/.test(line) && !line.startsWith("| Website decision"));
  const documented = rows.map((line) => line.split("|")[2].match(/`([^`]+)`/)?.[1]);
  // `Page Viewed` goes to PostHog as its own `$pageview`, which its web
  // analytics and paths read.
  const expected = events.map((name) => (name === "Page Viewed" ? "$pageview" : name));
  assert.deepEqual([...documented].sort(), [...expected].sort());
  for (const row of rows) {
    const sources = [...row.split("|")[4].matchAll(/`(src\/[^`]+)`/g)];
    assert.ok(sources.length > 0, `no source file named in: ${row}`);
    for (const [, source] of sources) {
      assert.ok(existsSync(new URL(source, web)), `${source} does not exist in apps/web`);
    }
  }
});
