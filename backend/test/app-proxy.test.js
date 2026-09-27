import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import app from '../src/app.js';

test('Cloudflare forwarded client IP is accepted by the API rate limiter', async () => {
  assert.equal(app.get('trust proxy'), 1);
  const server = app.listen(0);
  await once(server, 'listening');
  try {
    const { port } = server.address();
    const response = await fetch('http://127.0.0.1:' + port + '/api/health', {
      headers: { 'X-Forwarded-For': '203.0.113.25', Connection: 'close' }
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).success, true);
    assert.ok(response.headers.has('ratelimit'));
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
