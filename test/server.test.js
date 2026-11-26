'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createAppServer, startServer } = require('../server');
const { normalizePathname } = require('../src/router');

let server;
let port;

function request(method, reqPath, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: reqPath,
        method,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );

    req.on('error', reject);
    if (body !== null) {
      req.write(body);
    }
    req.end();
  });
}

describe('FreshFold Laundry HTTP Server', () => {
  before(async () => {
    server = createAppServer();
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('serves the home page on /home and / with 200 OK', async () => {
    const homeRes = await request('GET', '/home');
    assert.equal(homeRes.statusCode, 200);
    assert.match(homeRes.headers['content-type'], /^text\/html/);
    assert.match(homeRes.body, /Crisp, Fresh Laundry Delivered Right to Your Door/);
    assert.match(homeRes.body, /href="\/css\/styles\.css"/);

    const rootRes = await request('GET', '/');
    assert.equal(rootRes.statusCode, 200);
    assert.equal(rootRes.body, homeRes.body);
  });

  it('serves /about and /contact HTML pages with 200 OK', async () => {
    const aboutRes = await request('GET', '/about');
    assert.equal(aboutRes.statusCode, 200);
    assert.match(aboutRes.headers['content-type'], /^text\/html/);
    assert.match(aboutRes.body, /About FreshFold Laundry/);

    const contactRes = await request('GET', '/contact');
    assert.equal(contactRes.statusCode, 200);
    assert.match(contactRes.headers['content-type'], /^text\/html/);
    assert.match(contactRes.body, /Contact &amp; Pickup Request/);
    assert.match(contactRes.body, /action="\/contact"/);
  });

  it('serves additional meaningful routes (/services, /pricing, /api/status)', async () => {
    const servicesRes = await request('GET', '/services');
    assert.equal(servicesRes.statusCode, 200);
    assert.match(servicesRes.body, /Our Laundry &amp; Dry Cleaning Services/);

    const pricingRes = await request('GET', '/pricing');
    assert.equal(pricingRes.statusCode, 200);
    assert.match(pricingRes.body, /Pricing &amp; Weekly Plans/);

    const statusRes = await request('GET', '/api/status');
    assert.equal(statusRes.statusCode, 200);
    assert.match(statusRes.headers['content-type'], /^application\/json/);
    const json = JSON.parse(statusRes.body);
    assert.equal(json.status, 'ok');
    assert.ok(json.routes.includes('/home'));
    assert.ok(json.routes.includes('/about'));
    assert.ok(json.routes.includes('/contact'));
  });

  it('normalizes trailing slashes, uppercase paths, and query parameters', async () => {
    const res = await request('GET', '/HOME/?source=nav');
    assert.equal(res.statusCode, 200);
    assert.match(res.body, /FreshFold/);
  });

  it('serves CSS stylesheet and favicon assets with proper MIME types', async () => {
    const cssRes = await request('GET', '/css/styles.css');
    assert.equal(cssRes.statusCode, 200);
    assert.match(cssRes.headers['content-type'], /^text\/css/);
    assert.match(cssRes.body, /\.site-header/);

    const svgRes = await request('GET', '/favicon.svg');
    assert.equal(svgRes.statusCode, 200);
    assert.match(svgRes.headers['content-type'], /^image\/svg\+xml/);

    const icoRes = await request('GET', '/favicon.ico');
    assert.equal(icoRes.statusCode, 204);
    assert.equal(icoRes.body, '');
  });

  it('serves custom 404 page for invalid routes and blocks path traversal', async () => {
    const notFoundRes = await request('GET', '/does-not-exist');
    assert.equal(notFoundRes.statusCode, 404);
    assert.match(notFoundRes.headers['content-type'], /^text\/html/);
    assert.match(notFoundRes.body, /Looks Like That Sock Went Missing/);

    const missingAssetRes = await request('GET', '/css/missing.css');
    assert.equal(missingAssetRes.statusCode, 404);
    assert.match(missingAssetRes.body, /HTTP 404/);

    const traversalRes = await request('GET', '/css/../package.json');
    assert.equal(traversalRes.statusCode, 404);
    assert.doesNotMatch(traversalRes.body, /assignment-6-nodejs-web-server/);
  });

  it('handles HEAD requests without sending a body', async () => {
    const res = await request('HEAD', '/home');
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /^text\/html/);
    assert.ok(Number(res.headers['content-length']) > 0);
    assert.equal(res.body, '');
  });

  it('handles POST /contact submissions with validation and HTML escaping', async () => {
    const formBody = new URLSearchParams({
      name: 'Taylor <Admin>',
      email: 'taylor@example.com',
      service: 'Dry Cleaning & Press',
      message: 'Pickup tomorrow at 9 AM <script>alert(1)</script>',
    }).toString();

    const okRes = await request('POST', '/contact', {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(formBody),
      },
      body: formBody,
    });

    assert.equal(okRes.statusCode, 200);
    assert.match(okRes.body, /Taylor &lt;Admin&gt;/);
    assert.doesNotMatch(okRes.body, /<script>alert\(1\)<\/script>/);
    assert.match(okRes.body, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);

    const badBody = new URLSearchParams({ name: 'Only Name' }).toString();
    const badRes = await request('POST', '/contact', {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(badBody),
      },
      body: badBody,
    });
    assert.equal(badRes.statusCode, 400);
    assert.match(badRes.body, /Please Complete All Required Fields/);
  });

  it('returns 405 Method Not Allowed for unsupported methods and 413 for oversized payloads', async () => {
    const methodRes = await request('DELETE', '/home');
    assert.equal(methodRes.statusCode, 405);
    assert.equal(methodRes.headers.allow, 'GET, HEAD');

    const hugeBody = `name=A&email=a@b.com&message=${'x'.repeat(70 * 1024)}`;
    const largeRes = await request('POST', '/contact', {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(hugeBody),
      },
      body: hugeBody,
    });
    assert.equal(largeRes.statusCode, 413);
  });

  it('handles JSON POST /contact payloads and invalid JSON with 400', async () => {
    const jsonBody = JSON.stringify({
      name: 'Jordan',
      email: 'jordan@example.com',
      service: 'Express Same-Day',
      message: 'Please pick up at noon.',
    });

    const okRes = await request('POST', '/contact', {
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(jsonBody),
      },
      body: jsonBody,
    });
    assert.equal(okRes.statusCode, 200);
    assert.match(okRes.body, /Thank you, Jordan!/);

    const badJson = '{not-json';
    const badRes = await request('POST', '/contact', {
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(badJson),
      },
      body: badJson,
    });
    assert.equal(badRes.statusCode, 400);
    assert.match(badRes.body, /Invalid Request Body/);
  });

  it('supports startServer, request logging, and malformed URL normalization', async () => {
    assert.equal(normalizePathname('http://[::1'), null);
    assert.equal(normalizePathname('/Services/?x=1'), '/services');

    const logs = [];
    const started = await startServer(0, '127.0.0.1', { logger: (line) => logs.push(line) });
    try {
      const boundPort = started.address().port;
      assert.ok(boundPort > 0);

      await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${boundPort}/home`, (res) => {
          res.resume();
          res.on('end', resolve);
        }).on('error', reject);
      });

      assert.equal(logs.length, 1);
      assert.match(logs[0], /GET \/home -> 200/);
    } finally {
      await new Promise((resolve, reject) => {
        started.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});
