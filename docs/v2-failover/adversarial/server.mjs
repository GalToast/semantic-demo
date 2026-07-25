// server.mjs — mock HTTP server implementing all cited error shapes
import http from 'node:http';
import { lookupShape, SHAPES_TABLE } from './shapes-table.mjs';

export function startMockServer({ port = 0, requestLog = null } = {}) {
  const server = http.createServer((req, res) => {
    const at = Date.now();
    res.setHeader('Content-Type', 'application/json');

    let url = req.url || '/';
    const parsed = new URL(url, `http://localhost:${port || 0}`);
    let pathPart = parsed.pathname || '';

    // Extract carrier + model from path: /<carrier>/<model>/v1/chat/completions
    // Also support query params ?carrier=...&model=...
    const queryCarrier = parsed.searchParams.get('carrier') || '';
    const queryModel = parsed.searchParams.get('model') || '';

    let carrier = '';
    let model = '';

    // Try path parsing first: trim /v1/chat/completions suffix
    const segments = pathPart.split('/').filter(Boolean);
    if (segments.length >= 2 && segments[segments.length - 1] === 'v1' && segments[segments.length - 2] === 'chat' && segments[segments.length - 3] === 'completions') {
      // Actually convention is /carrier/model/v1/chat/completions — adjust parsing
    }

    // Simpler: split path by '/' and drop trailing 'v1/chat/completions'
    const trimmed = pathPart.replace(/\/v1\/chat\/completions$/, '').replace(/\/$/, '');
    const splitPaths = trimmed.split('/').filter(Boolean);
    if (splitPaths.length >= 2) {
      carrier = splitPaths[0];
      model = splitPaths[1];
      // Trim 'router-' prefix from carrier
      if (carrier.startsWith('router-')) {
        carrier = carrier.slice('router-'.length);
      }
    } else if (queryCarrier && queryModel) {
      carrier = queryCarrier;
      model = queryModel;
      if (carrier.startsWith('router-')) {
        carrier = carrier.slice('router-'.length);
      }
    }

    // Handle /ping
    if (pathPart === '/ping' || pathPart === '/ping/') {
      res.statusCode = 200;
      res.end(JSON.stringify({ ok: true, ping: true, at }));
      if (requestLog) requestLog.push({ at, carrier: 'ping', model: 'ping', statusCode: 200 });
      return;
    }

    const shapeKey = (carrier && model) ? `${carrier}/${model}` : '';
    const shape = lookupShape(carrier, model);

    if (!shape) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'unknown shape', carrier, model, path: pathPart }));
      if (requestLog) requestLog.push({ at, carrier, model, statusCode: 404 });
      return;
    }

    const delayMs = shape.delayMs || 0;
    const statusCode = shape.statusCode || 200;
    const body = shape.body || { ok: true };

    if (delayMs > 0) {
      setTimeout(() => {
        res.statusCode = statusCode;
        res.end(JSON.stringify(body));
        if (requestLog) requestLog.push({ at, carrier, model, statusCode });
      }, delayMs);
    } else {
      res.statusCode = statusCode;
      res.end(JSON.stringify(body));
      if (requestLog) requestLog.push({ at, carrier, model, statusCode });
    }
  });

  server.listen(port, () => {
    const actualPort = server.address()?.port || port;
    // No-op
  });

  return {
    server,
    get port() { return server.address()?.port || 0; },
    close() {
      return new Promise((resolve) => {
        server.close(() => resolve());
        // Force resolve after brief timeout in case close stalls
        setTimeout(resolve, 300);
      });
    },
  };
}
