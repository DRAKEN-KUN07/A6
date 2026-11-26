'use strict';

const path = require('node:path');

// Base filesystem directories for HTML views and static assets.
const ROOT_DIR = path.resolve(__dirname, '..');
const VIEWS_DIR = path.join(ROOT_DIR, 'views');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

// Server binding and request body limit configuration.
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '';
const MAX_BODY_BYTES = 64 * 1024;

// Route-to-HTML mapping for all multi-page website routes.
const PAGE_ROUTES = Object.freeze({
  '/': 'home.html',
  '/home': 'home.html',
  '/services': 'services.html',
  '/pricing': 'pricing.html',
  '/about': 'about.html',
  '/contact': 'contact.html',
});

// Content-Type lookup by file extension so browsers interpret HTML, CSS, SVG, and JSON accurately.
const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
});

module.exports = {
  ROOT_DIR,
  VIEWS_DIR,
  PUBLIC_DIR,
  PORT,
  HOST,
  MAX_BODY_BYTES,
  PAGE_ROUTES,
  MIME_TYPES,
};
