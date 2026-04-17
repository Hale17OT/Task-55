import { buildApp } from '../../src/app.js';
import type { AppConfig } from '../../src/infrastructure/config.js';
import type { FastifyInstance } from 'fastify';
import type { AddressInfo } from 'net';

const TEST_DB_URL = process.env.DATABASE_URL || 'postgres://studioops:dev_password_change_me@localhost:54320/studioops';

export function getTestConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    DATABASE_URL: TEST_DB_URL,
    PORT: 0,
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    CORS_ORIGIN: 'http://localhost:4200',
    JWT_SECRET: 'test_jwt_secret_that_is_at_least_32_characters_long!!',
    ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    STORAGE_ROOT: './test-data/media',
    ...overrides,
  };
}

interface InjectOptions {
  method: string;
  url: string;
  headers?: Record<string, string>;
  payload?: any;
  cookies?: Record<string, string>;
}

interface InjectResponse {
  statusCode: number;
  headers: Record<string, string | string[]>;
  body: string;
  cookies: Array<Record<string, any>>;
  json: () => any;
  payload: string;
}

function parseSetCookie(setCookie: string): Record<string, any> {
  const parts = setCookie.split(';').map((p) => p.trim());
  const [nameValue, ...attrs] = parts;
  const eq = nameValue.indexOf('=');
  const name = nameValue.slice(0, eq);
  const value = nameValue.slice(eq + 1);
  const cookie: Record<string, any> = { name, value };
  for (const attr of attrs) {
    const idx = attr.indexOf('=');
    const k = (idx === -1 ? attr : attr.slice(0, idx)).toLowerCase();
    const v = idx === -1 ? '' : attr.slice(idx + 1);
    if (k === 'path') cookie.path = v;
    else if (k === 'domain') cookie.domain = v;
    else if (k === 'samesite') cookie.sameSite = v;
    else if (k === 'max-age') cookie.maxAge = Number(v);
    else if (k === 'expires') cookie.expires = new Date(v);
    else if (k === 'httponly') cookie.httpOnly = true;
    else if (k === 'secure') cookie.secure = true;
  }
  return cookie;
}

function isFormData(payload: any): boolean {
  return (
    payload &&
    typeof payload === 'object' &&
    typeof payload.getBuffer === 'function' &&
    typeof payload.getBoundary === 'function' &&
    typeof payload.getHeaders === 'function'
  );
}

/**
 * Build a fetch-based request shim that matches the shape of Fastify's
 * `app.inject()` API but issues real HTTP requests over a TCP socket.
 * This is true black-box testing — every request crosses the kernel network stack.
 */
function makeRequest(baseUrl: string): (opts: InjectOptions) => Promise<InjectResponse> {
  return async function request(opts: InjectOptions): Promise<InjectResponse> {
    const url = `${baseUrl}${opts.url}`;
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(opts.headers || {})) {
      headers[k.toLowerCase()] = String(v);
    }
    if (opts.cookies) {
      const cookieHeader = Object.entries(opts.cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
      headers['cookie'] = headers['cookie'] ? `${headers['cookie']}; ${cookieHeader}` : cookieHeader;
    }

    let body: BodyInit | undefined;
    if (opts.payload !== undefined && opts.payload !== null) {
      if (isFormData(opts.payload)) {
        body = opts.payload.getBuffer();
        // Spread form-data's headers (includes content-type with boundary + content-length)
        const fdHeaders = opts.payload.getHeaders();
        for (const [k, v] of Object.entries(fdHeaders)) {
          headers[k.toLowerCase()] = String(v);
        }
      } else if (opts.payload instanceof Buffer || opts.payload instanceof Uint8Array) {
        body = opts.payload as any;
      } else if (typeof opts.payload === 'string') {
        body = opts.payload;
      } else {
        body = JSON.stringify(opts.payload);
        if (!headers['content-type']) headers['content-type'] = 'application/json';
      }
    }

    const res = await fetch(url, { method: opts.method, headers, body, redirect: 'manual' });
    const text = await res.text();

    const setCookieList: string[] =
      typeof (res.headers as any).getSetCookie === 'function'
        ? (res.headers as any).getSetCookie()
        : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie') as string] : []);

    const responseHeaders: Record<string, string | string[]> = {};
    for (const [k, v] of res.headers.entries()) {
      const key = k.toLowerCase();
      if (key === 'set-cookie') continue;
      responseHeaders[key] = v;
    }
    if (setCookieList.length) responseHeaders['set-cookie'] = setCookieList;

    return {
      statusCode: res.status,
      headers: responseHeaders,
      body: text,
      payload: text,
      cookies: setCookieList.map(parseSetCookie),
      json: () => {
        try {
          return JSON.parse(text);
        } catch {
          return undefined;
        }
      },
    };
  };
}

/**
 * Build a Fastify app, bind it to an ephemeral local TCP port, and override
 * `app.inject()` to issue real HTTP requests against that port. Tests written
 * against the inject API now exercise the entire network stack — kernel TCP,
 * socket accept, HTTP parsing, header parsing, cookie serialization — with no
 * shortcuts. Removing the override would only affect speed, not behavior.
 *
 * `beforeListen` lets a test register additional routes before the listener
 * binds — necessary because Fastify rejects route registration once
 * `listen()` has resolved.
 */
export async function createTestApp(
  configOverrides: Partial<AppConfig> = {},
  beforeListen?: (app: FastifyInstance) => Promise<void> | void,
): Promise<FastifyInstance> {
  const config = getTestConfig(configOverrides);
  process.env.ENCRYPTION_KEY = config.ENCRYPTION_KEY;
  process.env.STORAGE_ROOT = config.STORAGE_ROOT;
  const app = await buildApp({ config });
  if (beforeListen) await beforeListen(app);
  await app.listen({ host: '127.0.0.1', port: 0 });
  const addr = app.server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  (app as any).inject = makeRequest(baseUrl);
  (app as any).baseUrl = baseUrl;
  return app;
}
