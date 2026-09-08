import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const base = process.argv[2] || 'http://localhost:3000';
const source = readFileSync(new URL('../lib/seo.ts', import.meta.url), 'utf8');
const context = { exports: {} };
vm.runInNewContext(
  ts.transpile(source, {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  }),
  context,
);
const { pageSEO, SITE_ORIGIN, SITE_INDEXABLE } = context.exports;
const links = new Set();
const assets = new Set();
const pageHtml = new Map();
const titles = new Set();
for (const path of Object.keys(pageSEO)) {
  const response = await fetch(base + path);
  assert.equal(response.status, 200, `${path}: response status`);
  const raw = await response.text();
  const html = raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  pageHtml.set(path, html);
  assert.equal([...html.matchAll(/<h1(?:\s|>)/g)].length, 1, `${path}: one H1`);
  const title = html.match(/<title>(.*?)<\/title>/)?.[1];
  assert.ok(title && !titles.has(title), `${path}: unique title`);
  titles.add(title);
  assert.match(
    html,
    /<meta name="description" content="[^"]{40,}"/,
    `${path}: description`,
  );
  assert.ok(
    html.includes(`href="${SITE_ORIGIN}${path === '/' ? '' : path}"`),
    `${path}: canonical`,
  );
  if (!SITE_INDEXABLE)
    assert.match(
      html,
      /name="robots" content="[^"]*noindex/,
      `${path}: draft noindex`,
    );
  for (const match of html.matchAll(/<a\b[^>]*href="([^"]+)"/g)) {
    const url = new URL(match[1].replaceAll('&amp;', '&'), base + path);
    if (
      url.origin === new URL(base).origin &&
      !url.pathname.startsWith('/admin')
    )
      links.add(url.pathname + url.hash);
  }
  for (const match of html.matchAll(/<img\b[^>]*src="([^"]+)"/g))
    assets.add(match[1].replaceAll('&amp;', '&'));
  for (const match of raw.matchAll(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
  ))
    assert.ok(JSON.parse(match[1])['@type'], `${path}: valid structured data`);
  console.log(`PASS ${path}: content, headings, metadata, structured data`);
}
for (const target of links) {
  const url = new URL(target, base);
  const path = url.pathname;
  const response = pageHtml.has(path) ? null : await fetch(base + path);
  assert.ok(
    !response || response.status < 400,
    `${target}: linked page exists`,
  );
  if (url.hash) {
    const html = pageHtml.get(path) || (await response.text());
    assert.ok(
      html.includes(`id="${decodeURIComponent(url.hash.slice(1))}"`),
      `${target}: anchor exists`,
    );
  }
}
for (const asset of assets)
  assert.equal(
    (await fetch(new URL(asset, base))).status,
    200,
    `${asset}: image loads`,
  );
for (const path of [
  '/robots.txt',
  '/sitemap.xml',
  '/brand-icon.png',
  '/fonts/nunito.woff2',
])
  assert.equal((await fetch(base + path)).status, 200, path);
assert.equal(
  (await fetch(base + '/this-page-does-not-exist')).status,
  404,
  'missing route returns 404',
);
assert.match(
  pageHtml.get('/contact'),
  /<form[^>]*action="\/api\/quotes"[^>]*method="post"/,
  'native form fallback',
);
console.log(
  `PASS ${links.size} internal destinations, ${assets.size} images, sitemap, robots, 404, and native form action`,
);

if (process.argv.includes('--submit-local-test')) {
  assert.ok(
    ['localhost', '127.0.0.1'].includes(new URL(base).hostname),
    'test submission is local-only',
  );
  const body = new URLSearchParams({
    name: 'K9 WEBSITE QA - LOCAL ONLY',
    zip: '56301',
    email: 'qa-local@example.invalid',
    phone: '3205550123',
    dogs: '2',
    frequency: 'weekly',
    notes: 'Synthetic local verification; not a customer request.',
  });
  const response = await fetch(base + '/api/quotes', {
    method: 'POST',
    body,
    redirect: 'manual',
  });
  assert.equal(response.status, 303, 'native form submission accepted');
  assert.equal(response.headers.get('location'), '/thank-you');
  console.log('PASS local native-form submission and thank-you redirect');
}
