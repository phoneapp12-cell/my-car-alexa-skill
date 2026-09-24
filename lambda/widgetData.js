'use strict';

/**
 * Pushes the three-car dashboard to the on-device APL data store (widget).
 *
 * Docs:
 *  - Data Store REST API: POST {endpoint}/v1/datastore/commands, target USER { type, id }
 *  - Auth: LWA client_credentials token, scope alexa::datastore
 *    (client ID / secret from Build > Tools > Permissions, bottom of page)
 *  - Endpoints: NA api.amazonalexa.com, EU api.eu.amazonalexa.com, FE api.fe.amazonalexa.com
 *
 * Every public function swallows errors: a failed push must never break a voice response.
 */

const https = require('https');
const { URL } = require('url');
const util = require('./util');

const PACKAGE_ID = 'CarDueDatesWidget';
const NAMESPACE = 'carDueDates';
const KEY = 'dashboard';
const DEFAULT_ENDPOINT = 'https://api.fe.amazonalexa.com'; // Far East (en-AU skills)
const LWA_TOKEN_URL = 'https://api.amazon.com/auth/o2/token';
const HTTP_TIMEOUT_MS = 2500;

let transport = httpsRequest; // replaceable in tests
let retryDelayMs = 2000;
let tokenCache = null; // { accessToken, tokenType, expiresAt }
let configOverride = null;

/* ---------- config ---------- */

function loadConfig() {
  if (configOverride) return configOverride;
  let fileCfg = {};
  try {
    // lambda/config.js is created by the user in the Alexa-hosted Code tab (never committed).
    // eslint-disable-next-line global-require
    fileCfg = require('./config') || {};
  } catch (e) {
    fileCfg = {};
  }
  return {
    clientId: process.env.SKILL_CLIENT_ID || fileCfg.skillClientId || '',
    clientSecret: process.env.SKILL_CLIENT_SECRET || fileCfg.skillClientSecret || '',
    endpoint: process.env.DATASTORE_API_ENDPOINT || fileCfg.dataStoreApiEndpoint || '',
  };
}

function isConfigured(cfg) {
  const c = cfg || loadConfig();
  const placeholder = (v) => !v || /REPLACE_ME/.test(String(v));
  return !placeholder(c.clientId) && !placeholder(c.clientSecret);
}

/* ---------- HTTP ---------- */

function httpsRequest({ method, url, headers, body, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      method,
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers,
      timeout: timeoutMs || HTTP_TIMEOUT_MS,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = data ? JSON.parse(data) : null; } catch (e) { json = null; }
        resolve({ statusCode: res.statusCode, body: json, raw: data });
      });
    });
    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

/* ---------- LWA token ---------- */

async function getAccessToken(cfg) {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt - 60000 > now) return tokenCache;

  const form = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    scope: 'alexa::datastore',
  }).toString();

  const res = await transport({
    method: 'POST',
    url: LWA_TOKEN_URL,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'Content-Length': Buffer.byteLength(form),
    },
    body: form,
  });

  if (res.statusCode !== 200 || !res.body || !res.body.access_token) {
    throw new Error(`LWA token request failed (HTTP ${res.statusCode})`);
  }
  tokenCache = {
    accessToken: res.body.access_token,
    tokenType: res.body.token_type || 'bearer',
    expiresAt: now + (Number(res.body.expires_in) || 3600) * 1000,
  };
  return tokenCache;
}

/* ---------- endpoint ---------- */

function resolveEndpoint(requestEnvelope, attrs, cfg) {
  const fromCfg = cfg && cfg.endpoint;
  const fromReq = requestEnvelope && requestEnvelope.context &&
    requestEnvelope.context.System && requestEnvelope.context.System.apiEndpoint;
  const fromAttrs = attrs && attrs.widget && attrs.widget.apiEndpoint;
  const candidates = [fromCfg, fromReq, fromAttrs, DEFAULT_ENDPOINT];
  for (const c of candidates) {
    if (c && /^https:\/\/api(\.[a-z]+)?\.amazonalexa\.com\/?$/.test(c)) {
      return c.replace(/\/$/, '');
    }
  }
  return DEFAULT_ENDPOINT;
}

/* ---------- content ---------- */

function shortDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[m - 1]} ${y}`;
}

function dueDay(iso) {
  if (!iso) return null;
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isNaN(t) ? null : Math.floor(t / 86400000);
}

function cell(iso) {
  return { dateText: shortDate(iso), dueDay: dueDay(iso) };
}

/**
 * Data store object for namespace carDueDates / key dashboard.
 * Widget computes days-left and colour on-device from dueDay + APL localTime.
 */
function buildWidgetContent(attrs, timezone) {
  util.ensurePersistenceShape(attrs);
  const content = {};
  for (const id of util.VEHICLE_ORDER) {
    const v = attrs.vehicles[id] || {};
    content[id] = {
      rego: cell(v.regoExpiry),
      wof: cell(v.wofExpiry),
      service: cell(v.nextService && v.nextService.date),
    };
  }
  let stamp = '';
  try {
    stamp = new Intl.DateTimeFormat('en-NZ', {
      timeZone: timezone || util.DEFAULT_TIMEZONE,
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date());
  } catch (e) {
    stamp = util.todayIso(timezone);
  }
  content.updatedText = `Updated ${stamp} · tap to open`;
  return content;
}

function buildCommands(attrs, timezone) {
  return [{
    type: 'PUT_OBJECT',
    namespace: NAMESPACE,
    key: KEY,
    content: buildWidgetContent(attrs, timezone),
  }];
}

/* ---------- push ---------- */

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function postCommands(endpoint, token, commands, userId) {
  const body = JSON.stringify({
    commands,
    target: { type: 'USER', id: userId },
  });
  return transport({
    method: 'POST',
    url: `${endpoint}/v1/datastore/commands`,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      Authorization: `Bearer ${token.accessToken}`,
    },
    body,
  });
}

/**
 * Push dashboard to all of the user's devices. Never throws.
 * @returns {Promise<{pushed:boolean, reason?:string, statusCode?:number, results?:Array}>}
 */
async function pushDashboard(requestEnvelope, attrs, timezone, options) {
  const opts = options || {};
  try {
    const cfg = loadConfig();
    if (!isConfigured(cfg)) {
      console.log('[widget] Skipping data store push: SKILL_CLIENT_ID / SKILL_CLIENT_SECRET not configured (lambda/config.js).');
      return { pushed: false, reason: 'not_configured' };
    }
    if (!opts.force && attrs && attrs.widget && attrs.widget.installed === false) {
      return { pushed: false, reason: 'widget_removed' };
    }
    const userId = (attrs && attrs.widget && attrs.widget.userId) ||
      (requestEnvelope.context && requestEnvelope.context.System &&
        requestEnvelope.context.System.user && requestEnvelope.context.System.user.userId);
    if (!userId) return { pushed: false, reason: 'no_user' };

    const endpoint = resolveEndpoint(requestEnvelope, attrs, cfg);
    const token = await getAccessToken(cfg);
    const commands = buildCommands(attrs, timezone);

    let res = await postCommands(endpoint, token, commands, userId);
    if (res.statusCode === 401) {
      tokenCache = null;
      const fresh = await getAccessToken(cfg);
      res = await postCommands(endpoint, fresh, commands, userId);
    }

    const results = (res.body && res.body.results) || [];
    const invalid = results.length > 0 && results.every((r) => r.type === 'INVALID_DEVICE');
    if (opts.retryOnInvalidDevice && invalid) {
      // Package may not be registered yet right after install; retry once.
      await sleep(retryDelayMs);
      res = await postCommands(endpoint, token, commands, userId);
    }

    const finalResults = (res.body && res.body.results) || [];
    console.log(`[widget] Data store push HTTP ${res.statusCode}: ${JSON.stringify(finalResults)}`);
    return {
      pushed: res.statusCode === 200,
      statusCode: res.statusCode,
      results: finalResults,
      endpoint,
    };
  } catch (err) {
    console.log(`[widget] Data store push failed (ignored): ${err && err.message}`);
    return { pushed: false, reason: 'error', error: err && err.message };
  }
}

/* ---------- test hooks ---------- */

function _setTransport(fn) { transport = fn || httpsRequest; }
function _setRetryDelay(ms) { retryDelayMs = ms; }
function _resetTokenCache() { tokenCache = null; }
function _setConfig(cfg) { configOverride = cfg; }

module.exports = {
  PACKAGE_ID,
  NAMESPACE,
  KEY,
  DEFAULT_ENDPOINT,
  loadConfig,
  isConfigured,
  resolveEndpoint,
  buildWidgetContent,
  buildCommands,
  pushDashboard,
  dueDay,
  shortDate,
  _setTransport,
  _setRetryDelay,
  _resetTokenCache,
  _setConfig,
};
