'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { VIEWS_DIR, PUBLIC_DIR, MIME_TYPES } = require('./config');

/**
 * Escapes HTML special characters to prevent XSS in dynamic markup.
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sends a buffer or string response with explicit status, headers, and HEAD support.
 */
function sendResponse(res, { statusCode, contentType, body = '', headers = {}, headOnly = false }) {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Content-Length': buffer.length,
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });

  if (headOnly) {
    res.end();
    return;
  }

  res.end(buffer);
}

/**
 * Resolves and serves a file inside a base directory asynchronously.
 * Returns false if the file does not exist or escapes baseDir.
 */
async function serveFile(res, baseDir, relativeFilePath, { statusCode = 200, headOnly = false } = {}) {
  // Prevent directory traversal outside baseDir (e.g. /css/../server.js).
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, relativeFilePath);

  if (resolvedTarget !== resolvedBase && !resolvedTarget.startsWith(`${resolvedBase}${path.sep}`)) {
    return false;
  }

  // Read the file asynchronously so the Node.js event loop stays non-blocking.
  let data;
  try {
    data = await fs.readFile(resolvedTarget);
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'EISDIR') {
      return false;
    }
    throw err;
  }

  const ext = path.extname(resolvedTarget).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  sendResponse(res, {
    statusCode,
    contentType,
    body: data,
    headOnly,
  });
  return true;
}

/**
 * Serves a view file from the views directory.
 */
async function serveView(res, fileName, options = {}) {
  return serveFile(res, VIEWS_DIR, fileName, options);
}

/**
 * Serves a static public asset if its path stays inside PUBLIC_DIR.
 */
async function servePublicAsset(res, urlPath, options = {}) {
  const sanitized = urlPath.replace(/^\/+/, '');
  if (!sanitized) {
    return false;
  }
  return serveFile(res, PUBLIC_DIR, sanitized, options);
}

/**
 * Builds a consistent styled HTML page for dynamic responses (form confirmation, errors).
 */
function renderStatusPage({ title, badge, heading, message, detailsHtml = '', primaryHref = '/home', primaryLabel = 'Back to Home' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} | FreshFold Laundry</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="stylesheet" href="/css/styles.css" />
</head>
<body>
  <header class="site-header">
    <div class="container nav-wrap">
      <a class="brand" href="/home">FreshFold<span>Laundry</span></a>
      <nav class="site-nav" aria-label="Primary navigation">
        <a href="/home">Home</a>
        <a href="/services">Services</a>
        <a href="/pricing">Pricing</a>
        <a href="/about">About</a>
        <a href="/contact">Contact</a>
      </nav>
    </div>
  </header>

  <main class="container page-section">
    <section class="card status-card">
      <span class="badge">${escapeHtml(badge)}</span>
      <h1>${escapeHtml(heading)}</h1>
      <p class="lead">${escapeHtml(message)}</p>
      ${detailsHtml}
      <div class="actions">
        <a class="btn btn-primary" href="${escapeHtml(primaryHref)}">${escapeHtml(primaryLabel)}</a>
        <a class="btn btn-secondary" href="/contact">Contact Page</a>
      </div>
    </section>
  </main>

  <footer class="site-footer">
    <div class="container footer-inner">
      <p>&copy; 2026 FreshFold Laundry &amp; Dry Cleaning. Powered by Node.js.</p>
    </div>
  </footer>
</body>
</html>`;
}

module.exports = {
  escapeHtml,
  sendResponse,
  serveView,
  servePublicAsset,
  renderStatusPage,
};
