'use strict';
/** E1 tests: My App relay summary → persistence shape, S3 fallback, km-only services (B6), WOF in progress (G10). No network. */
const path = require('path');
const assert = require('assert');
process.env.USE_MEMORY_PERSISTENCE = '1';
const store = {};
global.__carTrackerMemoryAdapter = {
  async getAttributes() { return store.u ? JSON.parse(JSON.stringify(store.u)) : {}; },
  async saveAttributes(env, a) { store.u = JSON.parse(JSON.stringify(a)); },
  async deleteAttributes() { delete store.u; },
};
const L = (f) => require(path.join(__dirname, '..', 'lambda', f));
const util = L('util.js'), apl = L('aplDocument.js'), widget = L('widgetData.js'), rc = L('relayCars.js'), { handler } = L('index.js');
widget._setConfig({ clientId: 'REPLACE_ME', clientSecret: 'REPLACE_ME', endpoint: '' }); // widget push off in tests
const TZ = 'Pacific/Auckland', KEY = 'k'.repeat(48), URL_ = 'https://relay.example/cars/alexa';
const plus = (n) => util.todayIso(TZ).replace(/^.*$/, (t) => new Date(Date.parse(t + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10));
const SUMMARY = { v: 1, updatedAt: '2026-10-21T05:00:00.000Z', cars: [
  { id: 'shane', plate: 'MUL27', model: '2014 Honda Fit', colour: 'Silver', regoExpiry: plus(65), wofExpiry: plus(339), nextService: { date: null, odometerKm: 105000 }, odometerKm: 104500, lastService: { date: '2026-04-01', odometerKm: 95000 } },
  { id: 'sarah', plate: 'PNU312', regoExpiry: plus(19), wofExpiry: plus(-5), wofInProgress: { recheck: plus(23), fixesDone: 1, fixesTotal: 3 } },
  { id: 'nope', regoExpiry: '2030-01-01' }] };
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; console.log('[PASS] ' + m); };
let calls = 0; const respond = (status, body, delay) => () => { calls++; return new Promise((r) => setTimeout(() => r({ status, body: JSON.stringify(body) }), delay || 0)); };
const req = (type, intent) => ({ version: '1.0', session: { new: true, sessionId: 's', application: { applicationId: 'a' }, user: { userId: 'u' } },
  context: { System: { application: { applicationId: 'a' }, user: { userId: 'u' }, device: { deviceId: 'd', supportedInterfaces: {} }, apiEndpoint: 'https://api.amazonalexa.com', apiAccessToken: 'T' } },
  request: Object.assign({ type, requestId: 'r', timestamp: new Date().toISOString(), locale: 'en-AU' }, intent ? { intent: { name: intent, confirmationStatus: 'NONE', slots: {} } } : {}) });
const run = (e) => new Promise((res, rej) => handler(e, {}, (err, out) => (err ? rej(err) : res(out))));
const said = (o) => String(o && o.response && o.response.outputSpeech && o.response.outputSpeech.ssml || '');

(async () => {
  // mapping
  const a = util.ensurePersistenceShape({ vehicles: { cass: Object.assign(util.emptyVehicle('cass'), { regoExpiry: '2026-11-15' }) } });
  ok(rc.mapIntoAttrs(a, SUMMARY) === true, 'mapping reports a change');
  ok(a.vehicles.shane.plate === 'MUL27' && a.vehicles.shane.nextService.odometerKm === 105000 && a.vehicles.shane.nextService.date === null, 'shane mapped with km-only service');
  ok(a.vehicles.sarah.wofInProgress.fixesTotal === 3 && a.vehicles.sarah.wofInProgress.recheck === plus(23), 'sarah WOF in progress mapped');
  ok(a.vehicles.cass.regoExpiry === '2026-11-15', 'car missing from summary keeps its cached dates');
  ok(!a.vehicles.nope && a.source.from === 'myapp', 'unknown ids ignored; source noted');
  ok(rc.mapIntoAttrs(a, SUMMARY) === false, 'same summary again: no change (no S3 write)');
  // B6 + G10 in voice, APL, widget
  const items = util.collectDueItems(a, TZ);
  const svc = items.find((i) => i.vehicleKey === 'shane' && i.type === 'service');
  ok(svc && /105000 kilometres/.test(svc.spoken) && /500 kilometres to go/.test(svc.spoken), 'km-only service is spoken (B6)');
  const wof = items.find((i) => i.vehicleKey === 'sarah' && i.type === 'wof');
  ok(wof && wof.inProgress && /in progress, 1 of 3 fixes done, recheck by/.test(wof.spoken), 'WOF in progress is spoken');
  const cols = apl.buildDashboardData(a, TZ).columns;
  ok(cols[1].rows[2].dateText === 'At 105,000 km' && cols[1].rows[2].daysText === 'By km', 'APL shows km-only service');
  ok(cols[0].rows[1].badge === 'In progress' && cols[0].rows[1].daysText === '1/3 fixes done' && /^Recheck /.test(cols[0].rows[1].dateText), 'APL shows WOF in progress');
  const w = widget.buildWidgetContent(a, TZ);
  ok(w.shane.service.dateText === '105,000 km' && w.shane.service.dueDay === null, 'widget shows km-only service');
  ok(/^Recheck /.test(w.sarah.wof.dateText) && w.sarah.wof.dueDay > 0, 'widget shows WOF recheck');
  // fallback
  rc._setConfig({ url: '', key: '' }); ok((await rc.syncInto({})).source === 'cache', 'not configured → S3 cache');
  rc._setConfig({ url: URL_, key: KEY });
  rc._setTransport(respond(404, { error: 'not_shared' })); ok((await rc.syncInto({})).source === 'cache', '404 → S3 cache');
  rc._setTransport(() => Promise.reject(new Error('ENOTFOUND'))); ok((await rc.syncInto({})).source === 'cache', 'network error → S3 cache');
  rc._setTransport(respond(200, SUMMARY, 5000)); const t0 = Date.now(); const r = await rc.syncInto({}, 300);
  ok(r.source === 'cache' && Date.now() - t0 < 1000, 'slow relay times out quickly → S3 cache');
  ok(rc.TIMEOUT_MS <= 2000, 'default timeout is under 2 seconds');
  rc._setTransport(respond(200, { nope: 1 })); ok((await rc.syncInto({})).source === 'cache', 'bad data → S3 cache');
  // handlers end to end (memory persistence)
  store.u = { vehicles: { shane: Object.assign(util.emptyVehicle('shane'), { regoExpiry: '2020-01-01' }) } };
  rc._setTransport(respond(200, SUMMARY)); calls = 0;
  const o = await run(req('LaunchRequest'));
  ok(calls === 1 && /105000 kilometres/.test(said(o)), 'launch reads My App dates');
  ok(store.u.vehicles.shane.regoExpiry === plus(65) && store.u.source.from === 'myapp', 'S3 cache refreshed from My App');
  rc._setTransport(() => Promise.reject(new Error('down')));
  const o2 = await run(req('IntentRequest', 'WhatsComingUpIntent'));
  ok(/in progress, 1 of 3 fixes done/.test(said(o2)), 'relay down → status still answers from the S3 cache');
  console.log(`\nPassed: ${pass}/${pass}`);
})().catch((e) => { console.error('[FAIL]', e && e.message); process.exit(1); });
