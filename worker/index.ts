/**
 * The two things GitHub Pages cannot do, and nothing else: the operator's service notices
 * and the minutes their page shows behind the QR sticker. Neither site sends a CORS header,
 * so something with a server has to ask on the browser's behalf. On Cloudflare Workers and,
 * until it shuts down, Deno Deploy, written with web standards only, so the same handlers
 * `server.ts` exposes run here unchanged.
 */
import { syncOfficialAlerts } from '../src/services/alertSyncService';
import { operatorTimesResponse } from '../src/services/operatorTimes';

/**
 * How long the edge keeps an answer. The services' own caches live in a module, and an
 * edge runtime may run many isolates; the Cache API in front is what actually keeps the
 * outbound request count near one per window. A failed read is held for a minute, not thirty.
 */
const EDGE_SECONDS = { alerts: 30 * 60, unreachable: 60, operator: 20 };

/**
 * A setting of the deployment. Cloudflare hands them to `fetch` as its second argument;
 * Deno Deploy keeps them in `Deno.env` and passes connection details there instead, which
 * name none of these. Read per request: Cloudflare has no `Deno`, and touching it while the
 * module loaded would have stopped the worker before it answered anything.
 */
const setting = (env: unknown, key: 'ALLOWED_ORIGIN' | 'DEPLOY_SHA'): string | undefined => {
  const given = env && typeof env === 'object' ? (env as Record<string, unknown>)[key] : undefined;
  if (typeof given === 'string') return given;
  return typeof Deno === 'undefined' ? undefined : Deno.env.get(key);
};

/** Never store an answer no browser will accept: an answer without a usable allow-origin is not stale, it is unusable. */
const cacheableFor = (maxAge: number, origin: string): number => (origin ? maxAge : 0);

const json = (body: unknown, status: number, maxAge: number, origin: string): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': origin,
      vary: 'Origin',
      'cache-control': cacheableFor(maxAge, origin) > 0 ? `public, max-age=${cacheableFor(maxAge, origin)}` : 'no-store',
      // When this answer was made, so a read can tell a fresh one from a three-day-old one whatever the runtime computes for `age`.
      'x-stored-at': String(Date.now()),
      'x-content-type-options': 'nosniff',
    },
  });

export async function handle(request: Request, env?: unknown): Promise<Response> {
  const url = new URL(request.url);
  /** The one site allowed to call this. No default on purpose: unset, the response carries no allow-origin and a browser refuses it. */
  const ALLOWED_ORIGIN = setting(env, 'ALLOWED_ORIGIN') ?? '';
  if (request.method !== 'GET') return json({ error: 'Only GET' }, 405, 0, ALLOWED_ORIGIN);

  // `caches.open(name)` is the web standard; the allowed origin goes in the key because it goes in the response.
  // The query string does not: `?x=1`, `?x=2`, ... were each a fresh entry that missed the
  // edge cache, one stored copy per made-up parameter. `refresh` is the only one read here.
  const cache = await caches.open('urbanos-lugo-api');
  const refresh = url.searchParams.get('refresh') === 'true' ? 'refresh=true&' : '';
  const cacheKey = new Request(`${url.origin}${url.pathname}?${refresh}__origin=${encodeURIComponent(ALLOWED_ORIGIN)}`);

  // `cache.match` does not read `cache-control` — a half-hour answer was served for three
  // days — so both freshness and the allow-origin are checked on the way out.
  const hit = await cache.match(cacheKey);
  if (hit) {
    const storedAt = Number(hit.headers.get('x-stored-at'));
    const maxAge = Number(/max-age=(\d+)/.exec(hit.headers.get('cache-control') ?? '')?.[1] ?? 0);
    const fresh = Number.isFinite(storedAt) && storedAt > 0 && (Date.now() - storedAt) / 1000 < maxAge;
    const usable = (hit.headers.get('access-control-allow-origin') ?? '') === ALLOWED_ORIGIN;
    if (fresh && usable) return hit;
    await cache.delete(cacheKey);
  }

  const respond = async (body: unknown, status: number, maxAge: number): Promise<Response> => {
    const res = json(body, status, maxAge, ALLOWED_ORIGIN);
    // Only a real answer is cached: an error cached for half an hour is half an hour of the same error.
    if (status === 200 && cacheableFor(maxAge, ALLOWED_ORIGIN) > 0) await cache.put(cacheKey, res.clone());
    return res;
  };

  // Which commit is answering, null when run by hand: the only way to tell a fresh deployment from an edge cache still serving the last one.
  if (url.pathname === '/api/version') return respond({ sha: setting(env, 'DEPLOY_SHA') ?? null }, 200, 0);

  if (url.pathname === '/api/alerts') {
    const force = url.searchParams.get('refresh') === 'true';
    // Without the council's feed: from Deno Deploy it never connected (none of the seven reads
    // logged on 6 and 13 October 2026), and every try held the answer back its four seconds.
    // The hourly snapshot and a self-hosted server.ts still read it.
    const data = await syncOfficialAlerts(force, Date.now(), false);
    return respond(data, 200, force ? 0 : data.status === 'unreachable' ? EDGE_SECONDS.unreachable : EDGE_SECONDS.alerts);
  }

  const stopMatch = url.pathname.match(/^\/api\/paradas\/([^/]+)\/agora$/);
  if (stopMatch) {
    // A malformed escape throws, and an uncaught throw here is a 500 from the runtime: say 400, as the express route does.
    let code: string;
    try {
      code = decodeURIComponent(stopMatch[1]);
    } catch {
      return respond({ error: 'Bad request' }, 400, 0);
    }
    const { status, body } = await operatorTimesResponse(code);
    return respond(body, status, status === 200 ? EDGE_SECONDS.operator : 0);
  }

  return respond({ error: 'Unknown endpoint' }, 404, 0);
}

export default { fetch: handle };
