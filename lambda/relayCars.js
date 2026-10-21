'use strict';

/**
 * E1: My App's Cars tab is the source of truth. When Shane turns on "Share car dates with Alexa" in My App, the app
 * publishes a small summary to the relay. The skill reads it here (key only, no browser Origin) and maps it into the
 * usual persistence shape, so voice, the APL dashboard and the widget all use it. S3 stays as the fallback cache.
 * Config: RELAY_CARS_URL and RELAY_CARS_KEY in config.js (gitignored) or the same-named environment variables.
 */
const https = require('https');
const { URL } = require('url');
const util = require('./util');

const TIMEOUT_MS = 1800;
let transport = null; // tests replace this
let configOverride = null;

function loadConfig() {
  if (configOverride) return configOverride;
  let f = {};
  try { f = require('./config') || {}; } catch (e) { f = {}; } // eslint-disable-line global-require
  const url = process.env.RELAY_CARS_URL || f.RELAY_CARS_URL || '';
  const key = process.env.RELAY_CARS_KEY || f.RELAY_CARS_KEY || '';
  return { url: /^https:\/\//.test(url) ? url : '', key: /^[A-Za-z0-9_-]{40,128}$/.test(key) ? key : '' };
}
const isConfigured = () => { const c = loadConfig(); return !!(c.url && c.key); };

function httpsGet(url, headers, timeoutMs) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({ method: 'GET', hostname: u.hostname, path: u.pathname + u.search, headers }, (res) => {
      let body = ''; res.setEncoding('utf8');
      res.on('data', (c) => { body += c; if (body.length > 50000) req.destroy(new Error('too_large')); });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

async function fetchSummary(timeoutMs) {
  const cfg = loadConfig();
  if (!cfg.url || !cfg.key) return { ok: false, reason: 'not_configured' };
  const t = timeoutMs || TIMEOUT_MS;
  const call = (transport || httpsGet)(cfg.url, { 'X-Cars-Key': cfg.key, Accept: 'application/json' }, t);
  let timer;
  const guard = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), t + 100); });
  try {
    const res = await Promise.race([call, guard]);
    if (!res || res.status !== 200) return { ok: false, reason: `http_${res && res.status}` };
    const data = JSON.parse(res.body);
    if (!data || !Array.isArray(data.cars)) return { ok: false, reason: 'bad_data' };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, reason: (e && e.message) || 'error' };
  } finally { clearTimeout(timer); }
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const d = (v) => (ISO.test(String(v || '')) ? String(v) : null);
const km = (v) => { const n = Math.round(Number(v)); return n > 0 ? n : null; };
const svc = (s) => { if (!s) return null; const o = { date: d(s.date), odometerKm: km(s.odometerKm) }; return o.date || o.odometerKm ? o : null; };

/** Map the relay summary onto attrs.vehicles (cars in the summary are replaced; cars not in it are left as cached). */
function mapIntoAttrs(attrs, data) {
  util.ensurePersistenceShape(attrs);
  let changed = false;
  for (const c of (data && data.cars) || []) {
    if (!c || !util.VEHICLES[c.id]) continue;
    const prev = attrs.vehicles[c.id] || util.emptyVehicle(c.id);
    const v = Object.assign({}, prev, {
      id: c.id,
      nickname: util.VEHICLES[c.id].nickname,
      plate: c.plate || null,
      model: c.model || null,
      colour: c.colour || null,
      regoExpiry: d(c.regoExpiry),
      wofExpiry: d(c.wofExpiry),
      lastService: svc(c.lastService),
      nextService: svc(c.nextService),
      odometerKm: km(c.odometerKm),
      wofInProgress: c.wofInProgress && (d(c.wofInProgress.recheck) || c.wofInProgress.fixesTotal)
        ? { recheck: d(c.wofInProgress.recheck), fixesDone: Number(c.wofInProgress.fixesDone) || 0, fixesTotal: Number(c.wofInProgress.fixesTotal) || 0 }
        : null,
    });
    if (JSON.stringify(v) !== JSON.stringify(prev)) changed = true;
    attrs.vehicles[c.id] = v;
  }
  const src = { from: 'myapp', updatedAt: (data && data.updatedAt) || null };
  if (!attrs.source || attrs.source.updatedAt !== src.updatedAt || attrs.source.from !== 'myapp') changed = true;
  attrs.source = src;
  return changed;
}

/** Fetch + map. Never throws. Returns { source: 'myapp' | 'cache', changed, reason }. */
async function syncInto(attrs, timeoutMs) {
  const r = await fetchSummary(timeoutMs);
  if (!r.ok) { if (r.reason !== 'not_configured') console.log(`[relayCars] using S3 cache: ${r.reason}`); return { source: 'cache', changed: false, reason: r.reason }; }
  return { source: 'myapp', changed: mapIntoAttrs(attrs, r.data) };
}

const VOICE_WRITE_NOTE = " Just so you know, My App's Cars tab is the main record, so this will be replaced by its dates next time I refresh.";

module.exports = {
  TIMEOUT_MS, loadConfig, isConfigured, fetchSummary, mapIntoAttrs, syncInto, VOICE_WRITE_NOTE,
  _setTransport(fn) { transport = fn; }, _setConfig(c) { configOverride = c; },
};
