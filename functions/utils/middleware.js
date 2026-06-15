import sentryPlugin from "@cloudflare/pages-plugin-sentry";
import '@sentry/tracing';

const DEFAULT_CORS_METHODS = 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS';
const DEFAULT_CORS_HEADERS = 'Content-Type, Authorization, X-Requested-With';
const CORS_ORIGIN_ENV_NAMES = ['CORS_ORIGINS', 'CORS_ORIGIN'];

function getConfiguredCorsOrigins(env) {
  for (const name of CORS_ORIGIN_ENV_NAMES) {
    const value = env?.[name];
    if (typeof value === 'string' && value.trim()) {
      return value
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean);
    }
  }

  return [];
}

function normalizeOrigin(origin) {
  try {
    const url = new URL(origin);
    return url.origin;
  } catch {
    return null;
  }
}

function isWildcardSubdomainMatch(origin, allowedOrigin) {
  if (!allowedOrigin.includes('*.')) return false;

  const normalizedOrigin = normalizeOrigin(origin);
  const normalizedAllowedOrigin = normalizeOrigin(allowedOrigin);
  if (!normalizedOrigin || !normalizedAllowedOrigin) return false;

  const originUrl = new URL(normalizedOrigin);
  const allowedUrl = new URL(normalizedAllowedOrigin);
  if (originUrl.protocol !== allowedUrl.protocol || originUrl.port !== allowedUrl.port) return false;

  const suffix = allowedUrl.hostname.slice(1).toLowerCase();
  return originUrl.hostname.toLowerCase().endsWith(suffix) && originUrl.hostname.length > suffix.length;
}

function isOriginAllowed(origin, allowedOrigins) {
  if (!origin || allowedOrigins.length === 0) return false;
  return allowedOrigins.some(allowedOrigin => (
    allowedOrigin === '*' ||
    allowedOrigin === origin ||
    isWildcardSubdomainMatch(origin, allowedOrigin)
  ));
}

export function getCorsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowedOrigins = getConfiguredCorsOrigins(env);

  if (!isOriginAllowed(origin, allowedOrigins)) {
    return new Headers();
  }

  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', allowedOrigins.includes('*') ? '*' : origin);
  headers.set('Access-Control-Allow-Methods', env?.CORS_METHODS || DEFAULT_CORS_METHODS);
  headers.set(
    'Access-Control-Allow-Headers',
    request.headers.get('Access-Control-Request-Headers') || env?.CORS_HEADERS || DEFAULT_CORS_HEADERS
  );
  headers.set('Access-Control-Max-Age', env?.CORS_MAX_AGE || '86400');
  headers.append('Vary', 'Origin');

  if (env?.CORS_ALLOW_CREDENTIALS === 'true' && !allowedOrigins.includes('*')) {
    headers.set('Access-Control-Allow-Credentials', 'true');
  }

  return headers;
}

export async function cors(context) {
  const headers = getCorsHeaders(context.request, context.env);

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  const response = await context.next();
  const responseHeaders = new Headers(response.headers);
  headers.forEach((value, key) => responseHeaders.set(key, value));

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders
  });
}

export function jsonResponse(context, body, init = {}) {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', headers.get('Content-Type') || 'application/json');
  getCorsHeaders(context.request, context.env).forEach((value, key) => headers.set(key, value));

  return new Response(JSON.stringify(body), {
    ...init,
    headers
  });
}

export async function errorHandling(context) {
  const env = context.env;
  if (typeof env.disable_telemetry == "undefined" || env.disable_telemetry == null || env.disable_telemetry == "") {
    context.data.telemetry = true;
    let remoteSampleRate = 0.001;
    try {
      const sampleRate = await fetchSampleRate(context)
      console.log("sampleRate", sampleRate);
      //check if the sample rate is not null
      if (sampleRate) {
        remoteSampleRate = sampleRate;
      }
    } catch (e) { console.log(e) }
    const sampleRate = env.sampleRate || remoteSampleRate;
    console.log("sampleRate", sampleRate);
    return sentryPlugin({
      dsn: "https://219f636ac7bde5edab2c3e16885cb535@o4507041519108096.ingest.us.sentry.io/4507541492727808",
      tracesSampleRate: sampleRate,
    })(context);;
  }
  return context.next();
}

export function telemetryData(context) {
  const env = context.env;
  if (typeof env.disable_telemetry == "undefined" || env.disable_telemetry == null || env.disable_telemetry == "") {
    try {
      const parsedHeaders = {};
      context.request.headers.forEach((value, key) => {
        parsedHeaders[key] = value
        //check if the value is empty
        if (value.length > 0) {
          context.data.sentry.setTag(key, value);
        }
      });
      const CF = JSON.parse(JSON.stringify(context.request.cf));
      const parsedCF = {};
      for (const key in CF) {
        if (typeof CF[key] == "object") {
          parsedCF[key] = JSON.stringify(CF[key]);
        } else {
          parsedCF[key] = CF[key];
          if (CF[key].length > 0) {
            context.data.sentry.setTag(key, CF[key]);
          }
        }
      }
      const data = {
        headers: parsedHeaders,
        cf: parsedCF,
        url: context.request.url,
        method: context.request.method,
        redirect: context.request.redirect,
      }
      //get the url path
      const urlPath = new URL(context.request.url).pathname;
      const hostname = new URL(context.request.url).hostname;
      context.data.sentry.setTag("path", urlPath);
      context.data.sentry.setTag("url", data.url);
      context.data.sentry.setTag("method", context.request.method);
      context.data.sentry.setTag("redirect", context.request.redirect);
      context.data.sentry.setContext("request", data);
      const transaction = context.data.sentry.startTransaction({ name: `${context.request.method} ${hostname}` });
      //add the transaction to the context
      context.data.transaction = transaction;
      return context.next();
    } catch (e) {
      console.log(e);
    } finally {
      context.data.transaction.finish();
    }
  }
  return context.next();
}

export async function traceData(context, span, op, name) {
  const data = context.data
  if (data.telemetry) {
    if (span) {
      console.log("span finish")
      span.finish();
    } else {
      console.log("span start")
      span = await context.data.transaction.startChild(
        { op: op, name: name },
      );
    }
  }
}

async function fetchSampleRate(context) {
  const data = context.data
  if (data.telemetry) {
    const url = "https://frozen-sentinel.pages.dev/signal/sampleRate.json";
    const response = await fetch(url);
    const json = await response.json();
    return json.rate;
  }
}