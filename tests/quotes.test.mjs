import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(
  new URL('../app/api/quotes/route.ts', import.meta.url),
  'utf8',
).replace("import { env } from 'cloudflare:workers';", '');
const compiled = ts.transpile(source, {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2022,
});

function handler(withDatabase = true) {
  const rows = [];
  const env = {
    DB: withDatabase
      ? {
          prepare: () => ({
            bind: (...values) => ({ run: async () => rows.push(values) }),
          }),
        }
      : null,
  };
  const context = { exports: {}, env, Response, crypto };
  vm.runInNewContext(compiled, context);
  return { post: context.exports.POST, rows };
}
const valid = {
  name: 'Website test',
  zip: '56301',
  email: 'test@example.com',
  phone: '3205550123',
  dogs: '2',
  frequency: 'weekly',
  notes: 'Synthetic local test only',
};
const request = (body) =>
  new Request('https://example.test/api/quotes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

test('persists a valid request with parameterized fields', async () => {
  const { post, rows } = handler();
  assert.equal((await post(request(valid))).status, 200);
  assert.equal(rows.length, 1);
  assert.equal(rows[0][1], valid.name);
  assert.equal(rows[0][6], 'weekly');
  assert.equal(rows[0][8], 'new');
});
test('accepts expanded monthly and commercial choices', async () => {
  for (const frequency of ['monthly', 'commercial']) {
    const { post, rows } = handler();
    assert.equal(
      (await post(request({ ...valid, frequency, dogs: 'shared' }))).status,
      200,
    );
    assert.equal(rows.length, 1);
  }
});
test('rejects malformed inputs without storing them', async () => {
  for (const body of [
    null,
    [],
    {},
    { ...valid, zip: 'nope' },
    { ...valid, email: 'a@' },
    { ...valid, phone: '123' },
    { ...valid, frequency: 'invalid' },
    { ...valid, dogs: 'invalid' },
  ]) {
    const { post, rows } = handler();
    assert.equal((await post(request(body))).status, 400);
    assert.equal(rows.length, 0);
  }
});
test('invalid JSON is handled', async () => {
  const { post } = handler();
  const req = new Request('https://example.test/api/quotes', {
    method: 'POST',
    body: '{broken',
  });
  assert.equal((await post(req)).status, 400);
});
test('missing storage fails clearly', async () => {
  const { post } = handler(false);
  assert.equal((await post(request(valid))).status, 503);
});

test('native form submission stores data and redirects without JavaScript', async () => {
  const { post, rows } = handler();
  const response = await post(
    new Request('https://example.test/api/quotes', {
      method: 'POST',
      body: new URLSearchParams(valid),
    }),
  );
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/thank-you');
  assert.equal(rows.length, 1);
});
test('invalid native forms get a readable HTML error', async () => {
  const { post, rows } = handler();
  const response = await post(
    new Request('https://example.test/api/quotes', {
      method: 'POST',
      body: new URLSearchParams({ name: 'Incomplete' }),
    }),
  );
  assert.equal(response.status, 400);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.equal(rows.length, 0);
});
