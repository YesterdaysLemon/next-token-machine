// Starts the real server on a free port and checks the routes the VPS relies on.
import assert from 'node:assert/strict';
import { createServer } from '../server.mjs';

const server = createServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

try {
  const health = await fetch(`${base}/healthz`);
  assert.equal(health.status, 200);
  const body = await health.json();
  assert.equal(body.ok, true);
  assert.equal(body.app, 'next-token-machine');

  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.match(await page.text(), /Next-Token Machine/);

  for (const f of ['font.js', 'model.js', 'machine.js', 'favicon.svg']) {
    assert.equal((await fetch(`${base}/${f}`)).status, 200, f);
  }
  assert.equal((await fetch(`${base}/nope.js`)).status, 404);
  assert.equal((await fetch(`${base}/..%2fserver.mjs`)).status, 403);
  assert.equal((await fetch(`${base}/`, { method: 'POST' })).status, 405);
  console.log('smoke ok');
} finally {
  server.close();
}
