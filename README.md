# Assignment 6: Simple Web Server with Node.js

A modular, zero-dependency Node.js web server built with the built-in `http`, `fs/promises`, and `path` modules. It serves a responsive **FreshFold Laundry & Dry Cleaning** multi-page website with CSS styling, interactive contact form handling, JSON status reporting, and a custom 404 error page.

## Project Structure

```text
├── package.json
├── server.js              # Entry point using http.createServer & graceful shutdown
├── src/
│   ├── config.js          # Port, host, MIME types, and route mappings
│   ├── fileService.js     # Async file serving, HTML escaping, status template helper
│   └── router.js          # Request normalization, route dispatch, POST & error handling
├── views/
│   ├── home.html          # / and /home
│   ├── services.html      # /services
│   ├── pricing.html       # /pricing
│   ├── about.html         # /about
│   ├── contact.html       # /contact
│   └── 404.html           # Custom 404 Not Found page
├── public/
│   ├── css/styles.css     # Shared responsive CSS styles
│   └── favicon.svg        # Laundry washer SVG icon
└── test/
    └── server.test.js     # Automated test suite using node:test
```

## Available Routes

| Method | Path | Status | Description |
| --- | --- | --- | --- |
| `GET` | `/`, `/home` | `200` | FreshFold Laundry home page |
| `GET` | `/services` | `200` | Laundry & dry cleaning services overview |
| `GET` | `/pricing` | `200` | Per-pound, subscription, and specialty pricing |
| `GET` | `/about` | `200` | Company story, eco practices, and hours |
| `GET` | `/contact` | `200` | Storefront details and pickup request form |
| `POST` | `/contact` | `200` / `400` | Processes form submissions with validation & escaping |
| `GET` | `/api/status` | `200` | JSON server health and route summary |
| `GET` | `/css/styles.css` | `200` | Shared CSS stylesheet |
| `GET` | `*` (invalid) | `404` | Custom 404 error page |

## Running & Testing

Start the server (defaults to port `3000` on `localhost`, override with `PORT` and `HOST` environment variables):

```bash
npm start
```

Then open these URLs in your web browser:

- `http://localhost:3000/home`
- `http://localhost:3000/services`
- `http://localhost:3000/pricing`
- `http://localhost:3000/about`
- `http://localhost:3000/contact`
- `http://localhost:3000/invalid-route` (triggers the custom `404` page)

Run the automated test suite:

```bash
npm test
```
