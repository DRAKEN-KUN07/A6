'use strict';

const { PAGE_ROUTES, MAX_BODY_BYTES, MIME_TYPES } = require('./config');
const {
  escapeHtml,
  sendResponse,
  serveView,
  servePublicAsset,
  renderStatusPage,
} = require('./fileService');

/**
 * Normalizes a request URL into a clean lowercase pathname without trailing slashes.
 * @param {string} rawUrl
 * @returns {string|null}
 */
function normalizePathname(rawUrl = '/') {
  try {
    const parsed = new URL(rawUrl, 'http://localhost');
    const trimmed = parsed.pathname.replace(/\/+$/, '');
    return (trimmed || '/').toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Reads the request body stream up to MAX_BODY_BYTES.
 */
function readRequestBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const declaredLength = Number(req.headers['content-length']);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      req.pause();
      const err = new Error('Payload too large');
      err.statusCode = 413;
      reject(err);
      return;
    }

    const chunks = [];
    let totalBytes = 0;
    let settled = false;

    req.on('data', (chunk) => {
      if (settled) return;
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        settled = true;
        req.pause();
        const err = new Error('Payload too large');
        err.statusCode = 413;
        reject(err);
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (!settled) {
        settled = true;
        resolve(Buffer.concat(chunks).toString('utf8'));
      }
    });

    req.on('error', (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
  });
}

/**
 * Parses URL-encoded or JSON contact form submissions.
 */
function parseContactPayload(rawBody, contentType = '') {
  const normalizedType = contentType.split(';')[0].trim().toLowerCase();
  if (normalizedType === 'application/json') {
    const data = JSON.parse(rawBody || '{}');
    return {
      name: String(data.name || '').trim(),
      email: String(data.email || '').trim(),
      service: String(data.service || 'Wash & Fold').trim(),
      message: String(data.message || '').trim(),
    };
  }

  const params = new URLSearchParams(rawBody);
  return {
    name: (params.get('name') || '').trim(),
    email: (params.get('email') || '').trim(),
    service: (params.get('service') || 'Wash & Fold').trim(),
    message: (params.get('message') || '').trim(),
  };
}

/**
 * Serves the custom 404 HTML page (with an inline fallback if 404.html is unavailable).
 */
async function sendNotFound(res, requestedPath, headOnly = false) {
  const served = await serveView(res, '404.html', { statusCode: 404, headOnly });
  if (!served) {
    const fallback = renderStatusPage({
      title: '404 Not Found',
      badge: '404 Error',
      heading: 'Page Not Found',
      message: `We could not find a page matching "${requestedPath}".`,
    });
    sendResponse(res, {
      statusCode: 404,
      contentType: MIME_TYPES['.html'],
      body: fallback,
      headOnly,
    });
  }
}

/**
 * Handles POST /contact submissions asynchronously.
 */
async function handleContactSubmission(req, res) {
  let payload;
  try {
    const rawBody = await readRequestBody(req);
    payload = parseContactPayload(rawBody, req.headers['content-type']);
  } catch (err) {
    if (err.statusCode === 413) {
      const html = renderStatusPage({
        title: '413 Payload Too Large',
        badge: '413 Error',
        heading: 'Submission Too Large',
        message: 'Your form submission exceeds the 64 KB size limit. Please shorten your message and try again.',
        primaryHref: '/contact',
        primaryLabel: 'Return to Form',
      });
      sendResponse(res, {
        statusCode: 413,
        contentType: MIME_TYPES['.html'],
        body: html,
        headers: { Connection: 'close' },
      });
      return;
    }

    const html = renderStatusPage({
      title: '400 Bad Request',
      badge: '400 Error',
      heading: 'Invalid Request Body',
      message: 'We could not parse your submission. Please use the contact form and try again.',
      primaryHref: '/contact',
      primaryLabel: 'Return to Form',
    });
    sendResponse(res, { statusCode: 400, contentType: MIME_TYPES['.html'], body: html });
    return;
  }

  if (!payload.name || !payload.email || !payload.message) {
    const html = renderStatusPage({
      title: '400 Missing Fields',
      badge: '400 Validation',
      heading: 'Please Complete All Required Fields',
      message: 'Name, email address, and message are required to submit a pickup or inquiry request.',
      primaryHref: '/contact',
      primaryLabel: 'Back to Contact Form',
    });
    sendResponse(res, { statusCode: 400, contentType: MIME_TYPES['.html'], body: html });
    return;
  }

  const detailsHtml = `
    <div class="summary-box">
      <p><strong>Name:</strong> ${escapeHtml(payload.name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(payload.email)}</p>
      <p><strong>Service:</strong> ${escapeHtml(payload.service)}</p>
      <p><strong>Message:</strong> ${escapeHtml(payload.message)}</p>
    </div>`;

  const html = renderStatusPage({
    title: 'Request Received',
    badge: '200 Confirmed',
    heading: `Thank you, ${payload.name}!`,
    message: 'Your FreshFold Laundry inquiry has been received. Our team will respond within 2 business hours.',
    detailsHtml,
    primaryHref: '/home',
    primaryLabel: 'Back to Home',
  });

  sendResponse(res, {
    statusCode: 200,
    contentType: MIME_TYPES['.html'],
    body: html,
  });
}

/**
 * Main asynchronous HTTP request handler.
 */
async function handleRequest(req, res) {
  const method = (req.method || 'GET').toUpperCase();
  let pathname = '/';
  const headOnly = method === 'HEAD';

  try {
    // 1. Normalize URL path (strips query strings, trailing slashes, and case differences).
    pathname = normalizePathname(req.url);
    if (!pathname) {
      const html = renderStatusPage({
        title: '400 Bad Request',
        badge: '400 Error',
        heading: 'Malformed Request URL',
        message: 'The requested URL could not be parsed.',
      });
      sendResponse(res, {
        statusCode: 400,
        contentType: MIME_TYPES['.html'],
        body: html,
        headOnly,
      });
      return;
    }

    // 2. Handle interactive Contact form submissions on POST /contact.
    if (pathname === '/contact' && method === 'POST') {
      await handleContactSubmission(req, res);
      return;
    }

    // 3. Reject unsupported HTTP verbs with 405 Method Not Allowed.
    if (method !== 'GET' && method !== 'HEAD') {
      const allowed = pathname === '/contact' ? 'GET, HEAD, POST' : 'GET, HEAD';
      const html = renderStatusPage({
        title: '405 Method Not Allowed',
        badge: '405 Error',
        heading: 'Method Not Allowed',
        message: `HTTP method ${method} is not supported for ${pathname}. Allowed methods: ${allowed}.`,
      });
      sendResponse(res, {
        statusCode: 405,
        contentType: MIME_TYPES['.html'],
        body: html,
        headers: { Allow: allowed },
      });
      return;
    }

    // 4. Silence default browser /favicon.ico requests and serve JSON status endpoint.
    if (pathname === '/favicon.ico') {
      sendResponse(res, {
        statusCode: 204,
        contentType: 'image/x-icon',
        body: '',
        headOnly: true,
      });
      return;
    }

    if (pathname === '/api/status') {
      const payload = JSON.stringify(
        {
          status: 'ok',
          service: 'FreshFold Laundry Web Server',
          routes: Object.keys(PAGE_ROUTES),
          uptimeSeconds: Math.round(process.uptime()),
        },
        null,
        2
      );
      sendResponse(res, {
        statusCode: 200,
        contentType: MIME_TYPES['.json'],
        body: payload,
        headOnly,
      });
      return;
    }

    // 5. Serve matching HTML page views or static CSS/SVG assets from disk.
    const viewFile = PAGE_ROUTES[pathname];
    if (viewFile) {
      const served = await serveView(res, viewFile, { statusCode: 200, headOnly });
      if (served) return;
    }

    const servedAsset = await servePublicAsset(res, pathname, { statusCode: 200, headOnly });
    if (servedAsset) return;

    // 6. Serve the custom 404 page when no route or static asset matches.
    await sendNotFound(res, pathname, headOnly);
  } catch (err) {
    console.error(`[server] Error handling ${method} ${pathname}:`, err);
    if (res.headersSent) {
      res.destroy();
      return;
    }
    const html = renderStatusPage({
      title: '500 Server Error',
      badge: '500 Error',
      heading: 'Internal Server Error',
      message: 'Something went wrong while processing your request. Please try again shortly.',
    });
    sendResponse(res, {
      statusCode: 500,
      contentType: MIME_TYPES['.html'],
      body: html,
      headOnly,
    });
  }
}

module.exports = {
  normalizePathname,
  handleRequest,
};
