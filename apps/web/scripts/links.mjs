/**
 * Every link on every page: does the target exist?
 *
 * Reads the HTML each route serves, without running any of its JavaScript:
 * every page is rendered on the server, so its links and ids are already in
 * that first response.
 */
const BASE = process.argv[2] ?? "http://localhost:3000";

const get = async (path) => {
  const res = await fetch(`${BASE}${path}`);
  return { status: res.status, html: await res.text() };
};

const decode = (value) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

// The value of every `name` attribute on the matching tags, in document order.
const attributes = (html, tag, name) =>
  [...html.matchAll(new RegExp(`<${tag}\\b[^>]*?\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "gi"))].map(
    (match) => decode(match[1] ?? match[2] ?? match[3]),
  );
const hrefs = (html) => attributes(html, "a", "href");
const ids = (html) => new Set(attributes(html, "[a-z][a-z0-9-]*", "id"));

/*
 * Every route, read off the sitemap rather than listed here: a hardcoded list
 * silently stops covering the site the moment somebody adds a route, and the
 * sitemap already has to be right.
 */
const sitemap = await get("/sitemap.xml");
const ROUTES = [...sitemap.html.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((match) => new URL(match[1]).pathname)
  .map((path) => (path === "" ? "/" : path))
  // Private shares do not belong in the sitemap, but their handoff page still
  // owes working links like every public route.
  .concat("/r/0123456789abcdef0123456789abcdef");

/*
 * Dish pages are `noindex` and so not in the sitemap, but they are still pages
 * people land on. Visit the ones a sitemap route links to, one level only: each
 * dish links on to eight more in a ring, and following that would walk all
 * 52,000.
 */
const SITEMAP_ROUTES = new Set(ROUTES);
const dish = (path) => /^\/food\/[^/]+$/.test(path);

console.log(`Checking ${ROUTES.length} sitemap routes, plus the dish pages they link to…`);
const problems = [];
// Each target is fetched once, for its status and its ids: the header points
// at the same home-page anchors on every route, and every source that links to
// a missing anchor is still reported.
const targets = new Map();
const target = async (path) => {
  if (!targets.has(path)) {
    const { status, html } = await get(path);
    targets.set(path, { status, ids: ids(html) });
  }
  return targets.get(path);
};

for (const route of ROUTES) {
  const { html } = await get(route);
  const own = ids(html);

  for (const href of hrefs(html)) {
    if (href.startsWith("mailto:") || href.startsWith("ricecal:")) continue;
    if (href.startsWith("http")) continue; // external, not ours to check
    if (href.startsWith("#")) {
      if (!own.has(href.slice(1))) problems.push(`${route}: dead anchor ${href}`);
      continue;
    }
    const [path, hash] = href.split("#");
    const linked = path || route;
    if (SITEMAP_ROUTES.has(route) && dish(linked) && !ROUTES.includes(linked)) ROUTES.push(linked);
    const { status, ids: theirs } = await target(linked);
    if (status !== 200) problems.push(`${route}: ${href} -> ${status}`);
    if (hash && !theirs.has(hash)) problems.push(`${route}: ${href} has no #${hash} on ${linked}`);
  }
}

console.log(`Checked ${ROUTES.length} routes.`);
console.log(problems.length ? `PROBLEMS:\n - ${problems.join("\n - ")}` : "Every internal link and anchor resolves.");
process.exitCode = problems.length ? 1 : 0;
