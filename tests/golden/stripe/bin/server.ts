// GENERATED FILE — do not edit by hand.
//
// A runnable reference host. The emitted code has no framework dependency, so
// nothing here outsources correctness to a library: routing, raw-body capture,
// and JSON parsing are all explicit.
//
// Run with: node --env-file-if-exists=.env --import tsx bin/server.ts
//
// Port 3000 is the conventional host for the provider's CLI webhook forwarder
// (the tool that relays live provider events to localhost during onboarding).
// Override with PORT when that does not fit.

import { createServer } from 'node:http';
import { loadConfig } from '../src/config.js';
import { StripeClient } from '../src/client.js';
import { allRoutes, type Route, type RouteRequest } from '../src/routes.js';
import { EventStore } from '../src/event-store.js';

const PORT = Number(process.env.PORT ?? 3000);
const MAX_BODY_BYTES = 1_048_576;

const routes: Route[] = (() => {
  const config = loadConfig();
  const store = new EventStore(process.env.EVENT_DB_PATH ?? 'vault-payments-events.db');
  return allRoutes(new StripeClient({ config }), { config, store });
})();

/** `/payments/{id}/capture` becomes a regex with a named `id` group. */
function toMatcher(template: string): { regex: RegExp; names: string[] } {
  const names: string[] = [];
  const source = template.replace(/\{(\w+)\}/gu, (_match, name: string) => {
    names.push(name);
    return `(?<${name}>[^/]+)`;
  });
  return { regex: new RegExp(`^${source}$`, 'u'), names };
}

const matchers = routes.map((route) => ({
  route,
  ...toMatcher(route.path),
}));

function match(method: string, pathname: string):
  | { kind: 'hit'; route: Route; params: Record<string, string> }
  | { kind: 'method' }
  | { kind: 'none' } {
  let pathMatched = false;
  for (const matcher of matchers) {
    const found = matcher.regex.exec(pathname);
    if (!found) continue;
    pathMatched = true;
    if (matcher.route.method !== method) continue;
    const params: Record<string, string> = {};
    for (const name of matcher.names) {
      params[name] = decodeURIComponent(found.groups?.[name] ?? '');
    }
    return { kind: 'hit', route: matcher.route, params };
  }
  return pathMatched ? { kind: 'method' } : { kind: 'none' };
}

/**
 * Reads the body ONCE as bytes. The webhook route verifies a signature over
 * these exact bytes, so there is no second parse pass that could re-serialise
 * them differently.
 */
function readBody(request: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolveChunk, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolveChunk(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function send(response: import('node:http').ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  response.end(body === undefined ? 'null' : JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://localhost:${PORT}`);
  const matched = match(request.method ?? 'GET', url.pathname);

  if (matched.kind === 'none') {
    send(response, 404, { error: 'not found' });
    return;
  }
  if (matched.kind === 'method') {
    send(response, 405, { error: 'method not allowed' });
    return;
  }

  try {
    const rawBody = await readBody(request);
    // Only the JSON routes get a parsed body; the webhook route needs the raw
    // bytes and parses them itself after verifying the signature.
    const isWebhook = matched.route.name === 'webhook';
    const payload: RouteRequest = {
      params: matched.params,
      headers: request.headers,
      rawBody,
      body: isWebhook ? undefined : payloadJson(rawBody),
    };
    const result = await matched.route.handler(payload);
    send(response, result.status, result.body);
  } catch (error) {
    if ((error as Error).name === 'ValidationError') {
      send(response, 400, { error: (error as Error).message });
      return;
    }
    if ((error as Error).message === 'body too large') {
      send(response, 413, { error: 'request body exceeds the 1 MiB limit' });
      return;
    }
    send(response, 500, { error: (error as Error).message });
  }
});

function payloadJson(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody || '{}');
  } catch {
    return {};
  }
}

server.listen(PORT, () => {
  for (const matcher of matchers) {
    process.stdout.write(`  ${matcher.route.method.padEnd(6)} ${matcher.route.path}\n`);
  }
  process.stdout.write(`listening on http://localhost:${PORT}\n`);
});
