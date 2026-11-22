#!/usr/bin/env node
/**
 * Single-page Gift Sleigh: static shell on :8765 + reverse proxy to OpenClaw :18789
 * (strips X-Frame-Options so chat embeds in-page like other hackathon demos).
 */
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GW_HOST = process.env.OPENCLAW_GATEWAY_HOST || '127.0.0.1';
const GW_PORT = Number(process.env.OPENCLAW_GATEWAY_PORT || 18789);
const PORT = Number(process.env.PORT || 8765);
const PREFIX = '/__openclaw__';

function loadEmbedGatewayToken() {
  const fromEnv = process.env.OPENCLAW_GATEWAY_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const cfgPath =
    process.env.OPENCLAW_CONFIG_PATH ||
    path.join(__dirname, '../../.openclaw-bounty-state/openclaw.json');
  try {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    return cfg?.gateway?.auth?.token?.trim() || '';
  } catch {
    return '';
  }
}

const EMBED_GATEWAY_TOKEN = loadEmbedGatewayToken();

function injectNativeControlAuth(html) {
  if (!EMBED_GATEWAY_TOKEN || !html.includes('<head>')) return html;
  const tag = '<script src="/__openclaw-embed-auth.js"></script>';
  return html.replace('<head>', `<head>${tag}`);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
};

function isShellPath(pathname) {
  if (pathname === '/' || pathname === '/index.html') return true;
  if (
    ['/styles.css', '/app.js', '/locked-prompt.txt', '/serve.mjs', '/favicon.ico'].includes(pathname)
  )
    return true;
  if (pathname.startsWith('/icons/')) return true;
  return false;
}

function stripFrameHeaders(raw) {
  const out = { ...raw };
  for (const key of Object.keys(out)) {
    if (key.toLowerCase() === 'x-frame-options') delete out[key];
    if (key.toLowerCase() === 'content-security-policy' && typeof out[key] === 'string') {
      out[key] = out[key].replace(/frame-ancestors[^;]*/gi, "frame-ancestors 'self'");
    }
  }
  return out;
}

function serveStatic(pathname, res) {
  const file =
    pathname === '/' || pathname === '/index.html'
      ? path.join(__dirname, 'index.html')
      : path.join(__dirname, pathname.replace(/^\//, ''));
  if (!file.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
}

function gatewayPath(url) {
  if (url.startsWith(PREFIX)) {
    const rest = url.slice(PREFIX.length) || '/';
    return rest.startsWith('/') ? rest : `/${rest}`;
  }
  return url;
}

function proxyHttp(req, res, urlPath) {
  const gwPath = gatewayPath(urlPath);
  const headers = { ...req.headers, host: `${GW_HOST}:${GW_PORT}` };
  delete headers.connection;
  delete headers['accept-encoding'];
  delete headers['Accept-Encoding'];

  const upstream = http.request(
    {
      hostname: GW_HOST,
      port: GW_PORT,
      path: gwPath + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''),
      method: req.method,
      headers,
    },
    (pres) => {
      const h = stripFrameHeaders(pres.headers);
      const ctype = String(pres.headers['content-type'] || '');
      const isHtml = ctype.includes('text/html');
      if (isHtml && EMBED_GATEWAY_TOKEN) {
        const chunks = [];
        pres.on('data', (c) => chunks.push(c));
        pres.on('end', () => {
          let body = Buffer.concat(chunks).toString('utf8');
          body = injectNativeControlAuth(body);
          delete h['content-length'];
          delete h['Content-Length'];
          delete h['content-encoding'];
          delete h['Content-Encoding'];
          res.writeHead(pres.statusCode ?? 502, h);
          res.end(body);
        });
        return;
      }
      res.writeHead(pres.statusCode ?? 502, h);
      pres.pipe(res);
    },
  );
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('OpenClaw gateway not reachable. Run: bash bounty/scripts/run-gateway.sh');
  });
  req.pipe(upstream);
}

function proxyUpgrade(req, clientSocket, head) {
  const gwPath = gatewayPath(req.url ?? '/');
  const serverSocket = net.connect({ port: GW_PORT, host: GW_HOST }, () => {
    const lines = [`${req.method} ${gwPath} HTTP/${req.httpVersion}`];
    for (const [k, v] of Object.entries(req.headers)) {
      if (k.toLowerCase() === 'host') continue;
      if (Array.isArray(v)) v.forEach((x) => lines.push(`${k}: ${x}`));
      else lines.push(`${k}: ${v}`);
    }
    lines.push(`host: ${GW_HOST}:${GW_PORT}`);
    lines.push('', '');
    serverSocket.write(lines.join('\r\n'));
    if (head?.length) serverSocket.write(head);
    serverSocket.pipe(clientSocket);
    clientSocket.pipe(serverSocket);
  });
  const fail = () => {
    try {
      clientSocket.destroy();
    } catch {
      /* ignore */
    }
    try {
      serverSocket.destroy();
    } catch {
      /* ignore */
    }
  };
  serverSocket.on('error', fail);
  clientSocket.on('error', fail);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  const pathname = url.pathname;

  if (pathname === '/sw.js' || pathname.endsWith('/sw.js')) {
    res.writeHead(404, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    res.end('service worker disabled on studio origin');
    return;
  }

  if (pathname === '/__openclaw-embed-auth.js') {
    const wsUrl = `ws://127.0.0.1:${PORT}`;
    const auth = JSON.stringify({ gatewayUrl: wsUrl, token: EMBED_GATEWAY_TOKEN });
    res.writeHead(200, {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(`window.__OPENCLAW_NATIVE_CONTROL_AUTH__=${auth};`);
    return;
  }

  if (isShellPath(pathname)) {
    serveStatic(pathname, res);
    return;
  }

  if (pathname.startsWith(PREFIX) || !isShellPath(pathname)) {
    proxyHttp(req, res, pathname + url.search);
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.on('upgrade', (req, socket, head) => {
  proxyUpgrade(req, socket, head);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Gift Sleigh  http://127.0.0.1:${PORT}/`);
  console.log(`(proxies OpenClaw at ${GW_HOST}:${GW_PORT} for in-page chat)`);
  if (EMBED_GATEWAY_TOKEN) {
    console.log('(embed auto-auth: token loaded from bounty state / OPENCLAW_GATEWAY_TOKEN)');
  }
});