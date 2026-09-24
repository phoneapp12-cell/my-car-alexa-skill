'use strict';

/**
 * Widget + data store tests (mocked HTTP; no real Amazon calls).
 * Run: node tests/widget-test.js
 */

const fs = require('fs');
const path = require('path');

process.env.USE_MEMORY_PERSISTENCE = '1';
const memoryStore = {};
global.__carTrackerMemoryAdapter = {
  async getAttributes(env) {
    const id = env.context.System.user.userId;
    return memoryStore[id] ? JSON.parse(JSON.stringify(memoryStore[id])) : {};
  },
  async saveAttributes(env, attrs) {
    memoryStore[env.context.System.user.userId] = JSON.parse(JSON.stringify(attrs));
  },
  async deleteAttributes(env) {
    delete memoryStore[env.context.System.user.userId];
  },
};

const ROOT = path.join(__dirname, '..');
const widget = require(path.join(ROOT, 'lambda', 'widgetData.js'));
const util = require(path.join(ROOT, 'lambda', 'util.js'));
const { handler } = require(path.join(ROOT, 'lambda', 'index.js'));

const USER = 'amzn1.ask.account.widgettest';
const FE = 'https://api.fe.amazonalexa.com';

/* ---------- mock transport ---------- */
let calls = [];
let behaviour = 'ok'; // ok | throw | invalidOnce
let invalidServed = false;

function mockTransport(req) {
  calls.push(req);
  if (behaviour === 'throw') return Promise.reject(new Error('network down'));
  if (req.url === 'https://api.amazon.com/auth/o2/token') {
    return Promise.resolve({ statusCode: 200, body: { access_token: 'Atc|TEST', token_type: 'bearer', expires_in: 3600 } });
  }
  if (behaviour === 'invalidOnce' && !invalidServed) {
    invalidServed = true;
    return Promise.resolve({
      statusCode: 200,
      body: { results: [{ deviceId: 'amzn1.ask.device.X', type: 'INVALID_DEVICE', message: 'The device does not have any package from this skill' }] },
    });
  }
  return Promise.resolve({ statusCode: 200, body: { results: [{ deviceId: 'amzn1.ask.device.X', type: 'SUCCESS' }] } });
}

function reset(b) {
  calls = [];
  behaviour = b || 'ok';
  invalidServed = false;
  widget._resetTokenCache();
}

widget._setTransport(mockTransport);
widget._setRetryDelay(0);
widget._setConfig({ clientId: 'amzn1.application-oa2-client.test', clientSecret: 'secret', endpoint: '' });

/* ---------- request helpers ---------- */
function envelope(request, extraContext) {
  return {
    version: '1.0',
    session: {
      new: false,
      sessionId: 'SessionId.w',
      application: { applicationId: 'amzn1.ask.skill.test' },
      user: { userId: USER },
    },
    context: Object.assign({
      System: {
        application: { applicationId: 'amzn1.ask.skill.test' },
        user: { userId: USER, permissions: { consentToken: 'x' } },
        device: { deviceId: 'amzn1.ask.device.X', supportedInterfaces: { 'Alexa.Presentation.APL': {} } },
        apiEndpoint: FE,
        apiAccessToken: 'tok',
      },
    }, extraContext || {}),
    request: Object.assign({
      requestId: 'req',
      timestamp: new Date().toISOString(),
      locale: 'en-AU',
    }, request),
  };
}

function noSession(env) {
  delete env.session; // lifecycle requests arrive outside a session
  return env;
}

function vehicleSlot(id) {
  return {
    name: 'vehicle',
    value: util.VEHICLES[id].nickname,
    resolutions: {
      resolutionsPerAuthority: [{
        authority: 'amzn1.er-authority.echo-sdk.test.VEHICLE_NAME',
        status: { code: 'ER_SUCCESS_MATCH' },
        values: [{ value: { name: util.VEHICLES[id].nickname, id } }],
      }],
    },
  };
}

function intent(name, slots) {
  return envelope({ type: 'IntentRequest', intent: { name, confirmationStatus: 'NONE', slots: slots || {} } });
}

function invoke(event) {
  return new Promise((resolve, reject) => {
    handler(event, {}, (err, res) => (err ? reject(err) : resolve(res)));
  });
}

const speech = (r) => ((r.response && r.response.outputSpeech && r.response.outputSpeech.ssml) || '').replace(/<\/?speak>/g, '');
const pushCalls = () => calls.filter((c) => c.url.endsWith('/v1/datastore/commands'));
const tokenCalls = () => calls.filter((c) => c.url === 'https://api.amazon.com/auth/o2/token');
const lastPushBody = () => JSON.parse(pushCalls()[pushCalls().length - 1].body);

/* ---------- run ---------- */
async function run() {
  const results = [];
  const ok = (name, cond, detail) => {
    results.push({ name, pass: !!cond, detail });
    console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
  };

  /* --- widget package files --- */
  const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  const files = [
    'widget/document.json', 'widget/data.json', 'widget/manifest.json', 'widget/widget-upload.json',
    'widget/datastore-test-commands.json',
    'skill-package/dataStorePackages/CarDueDatesWidget/manifest.json',
    'skill-package/dataStorePackages/CarDueDatesWidget/documents/document.json',
    'skill-package/dataStorePackages/CarDueDatesWidget/datasources/default.json',
    'skill-package/dataStorePackages/CarDueDatesWidget/presentations/default.tpl',
    'skill-package/skill.json',
  ];
  let allParse = true;
  for (const f of files) {
    try { readJson(f); } catch (e) { allParse = false; ok(`JSON parses: ${f}`, false, e.message); }
  }
  ok('all widget/skill JSON files parse', allParse, `${files.length} files`);

  const doc = readJson('widget/document.json');
  const data = readJson('widget/data.json');
  const man = readJson('widget/manifest.json');
  const tpl = readJson('skill-package/dataStorePackages/CarDueDatesWidget/presentations/default.tpl');
  const skill = readJson('skill-package/skill.json');

  ok('manifest id CarDueDatesWidget', man.manifest.id === widget.PACKAGE_ID);
  ok('manifest id matches doc regex', /^[a-zA-Z].[a-zA-Z0-9]*$/.test(man.manifest.id));
  ok('installStateChanges INFORM', man.manifest.installStateChanges === 'INFORM');
  ok('packageType APL_PACKAGE / packageVersion 1.0', man.packageType === 'APL_PACKAGE' && man.packageVersion === '1.0');
  const pub = man.publishingInformation.locales['en-AU'][0];
  ok('publishing name "Car Due Dates" (en-AU, WIDGET_M)', pub.metadata.name === 'Car Due Dates' && pub.targetViewport === 'WIDGET_M');
  ok('appliesTo HUB', man.manifest.appliesTo === "${viewport.mode == 'HUB'}");
  ok('tpl points at documents/document.json + datasources/default.json',
    tpl.type === 'APL_PRESENTATION' && tpl.documentUrl === 'documents/document.json' && tpl.datasourceUrl === 'datasources/default.json');

  const ext = (doc.extensions || []).find((e) => e.uri === 'alexaext:datastore:10');
  const binding = doc.settings && doc.settings[ext && ext.name] && doc.settings[ext.name].dataBindings[0];
  ok('document requests datastore extension', !!ext);
  ok('binding namespace/key carDueDates/dashboard OBJECT',
    binding && binding.namespace === widget.NAMESPACE && binding.key === widget.KEY && binding.dataType === 'OBJECT');
  ok('mainTemplate parameter matches datasource key',
    doc.mainTemplate.parameters.length === 1 && Object.prototype.hasOwnProperty.call(data, doc.mainTemplate.parameters[0]));

  const docStr = JSON.stringify(doc);
  ok('no unsupported widget features (EditText/Video/LongPress/SpeakItem)',
    !/"EditText"|"Video"|onLongPress|SpeakItem|SpeakList/.test(docStr));
  ok('no "when" bound to data store', !/"when":"[^"]*DS_CarDueDates/.test(docStr));
  ok('no data-array inflation from data store', !/"data":"\$\{DS_CarDueDates/.test(docStr));
  ok('tap sends SendEvent STANDARD openSkill',
    /"type":"SendEvent","arguments":\["openSkill"\],"flags":\{"interactionMode":"STANDARD"\}/.test(docStr));
  ok('document binds all 3 cars x 3 items',
    ['sarah', 'shane', 'cass'].every((c) => ['rego', 'wof', 'service'].every((i) => docStr.includes(`DS_CarDueDates.${c}.${i}.dueDay`))));

  const pkgDoc = readJson('skill-package/dataStorePackages/CarDueDatesWidget/documents/document.json');
  ok('skill-package copy == standalone copy', JSON.stringify(pkgDoc) === docStr);

  const ifs = skill.manifest.apis.custom.interfaces;
  const pm = ifs.find((i) => i.type === 'ALEXA_DATASTORE_PACKAGEMANAGER');
  ok('skill.json ALEXA_DATASTORE_PACKAGEMANAGER with package id', pm && pm.packages.some((p) => p.id === widget.PACKAGE_ID));
  ok('skill.json ALEXA_DATA_STORE', ifs.some((i) => i.type === 'ALEXA_DATA_STORE'));
  ok('skill.json ALEXA_EXTENSION datastore:10',
    ifs.some((i) => i.type === 'ALEXA_EXTENSION' && i.requestedExtensions.some((e) => e.uri === 'alexaext:datastore:10')));
  ok('skill.json still has APL', ifs.some((i) => i.type === 'ALEXA_PRESENTATION_APL'));
  const aplIf = ifs.find((i) => i.type === 'ALEXA_PRESENTATION_APL');
  const std = [
    'HUB/ROUND/100-599/100-599', 'HUB/RECTANGLE/960-1279/100-599', 'HUB/RECTANGLE/960-1279/600-959',
    'HUB/RECTANGLE/1280-1920/600-1279', 'HUB/RECTANGLE/1920-2560/960-1279',
  ];
  const vp = aplIf.supportedViewports.map((v) => `${v.mode}/${v.shape}/${v.minWidth}-${v.maxWidth}/${v.minHeight}-${v.maxHeight}`);
  ok('supportedViewports are documented profiles incl. XLarge (Echo Show 15)', vp.every((v) => std.includes(v)) && vp.includes(std[4]), vp.join(' '));
  ok('ask-resources.json present (hosted-skill layout)', fs.existsSync(path.join(ROOT, 'ask-resources.json')));
  ok('skill-package has en-AU model + lambda entry files', ['skill-package/interactionModels/custom/en-AU.json', 'lambda/index.js', 'lambda/package.json']
    .every((f) => fs.existsSync(path.join(ROOT, f))));

  // Sample datastore commands match binding
  const sample = readJson('widget/datastore-test-commands.json')[0];
  ok('sample commands target same namespace/key', sample.namespace === widget.NAMESPACE && sample.key === widget.KEY);

  /* --- UsagesInstalled → push --- */
  reset('ok');
  let res = await invoke(noSession(envelope({
    type: 'Alexa.DataStore.PackageManager.UsagesInstalled',
    payload: {
      packageId: 'CarDueDatesWidget',
      packageVersion: '1.0.0',
      usages: [{ instanceId: 'amzn1.ask.package.v1.instance.v1.x', location: 'FAVORITE' }],
    },
  })));
  ok('UsagesInstalled returns silent response', !speech(res));
  ok('UsagesInstalled fetched LWA token once', tokenCalls().length === 1);
  const form = new URLSearchParams(tokenCalls()[0].body);
  ok('LWA token request: client_credentials + scope alexa::datastore',
    form.get('grant_type') === 'client_credentials' && form.get('scope') === 'alexa::datastore' &&
    form.get('client_id') === 'amzn1.application-oa2-client.test');
  ok('UsagesInstalled pushed to FE /v1/datastore/commands', pushCalls().length === 1 && pushCalls()[0].url === `${FE}/v1/datastore/commands`);
  let body = lastPushBody();
  ok('push target USER with userId', body.target.type === 'USER' && body.target.id === USER);
  ok('push PUT_OBJECT carDueDates/dashboard',
    body.commands[0].type === 'PUT_OBJECT' && body.commands[0].namespace === 'carDueDates' && body.commands[0].key === 'dashboard');
  ok('push content has 3 cars', ['sarah', 'shane', 'cass'].every((c) => body.commands[0].content[c]));
  ok('Authorization Bearer header', pushCalls()[0].headers.Authorization === 'Bearer Atc|TEST');
  ok('install state persisted', memoryStore[USER].widget && memoryStore[USER].widget.installed === true &&
    memoryStore[USER].widget.apiEndpoint === FE);
  ok('payload under 16KB limit', Buffer.byteLength(pushCalls()[0].body) < 16 * 1024, `${Buffer.byteLength(pushCalls()[0].body)} bytes`);

  /* --- INVALID_DEVICE retry right after install --- */
  reset('invalidOnce');
  await invoke(noSession(envelope({
    type: 'Alexa.DataStore.PackageManager.UsagesInstalled',
    payload: { packageId: 'CarDueDatesWidget', packageVersion: '1.0.0', usages: [{ location: 'FAVORITE' }] },
  })));
  ok('INVALID_DEVICE after install triggers one retry', pushCalls().length === 2);

  /* --- push after set --- */
  reset('ok');
  res = await invoke(intent('SetWofIntent', {
    date: { name: 'date', value: '2027-06-01' },
    vehicle: vehicleSlot('sarah'),
  }));
  ok('SetWof speech still fine', /Sarah's car WOF is due on 1st of June 2027/.test(speech(res)), speech(res).slice(0, 80));
  ok('SetWof pushed to data store', pushCalls().length === 1);
  body = lastPushBody();
  const sarahWof = body.commands[0].content.sarah.wof;
  ok('pushed Sarah WOF dateText/dueDay', sarahWof.dateText === '1 Jun 2027' && sarahWof.dueDay === widget.dueDay('2027-06-01'),
    JSON.stringify(sarahWof));
  ok('unset items pushed as nulls', body.commands[0].content.cass.wof.dateText === null && body.commands[0].content.cass.wof.dueDay === null);

  reset('ok');
  await invoke(intent('RecordServiceIntent', {
    date: { name: 'date', value: '2026-09-24' },
    odometer: { name: 'odometer', value: '45000' },
    interval: { name: 'interval', value: '6 months' },
    vehicle: vehicleSlot('shane'),
  }));
  body = lastPushBody();
  ok('RecordService pushes Shane next service', body.commands[0].content.shane.service.dateText === '24 Mar 2027');

  reset('ok');
  await invoke(intent('ClearIntent', { itemType: { name: 'itemType', value: 'WOF' }, vehicle: vehicleSlot('sarah') }));
  body = lastPushBody();
  ok('Clear pushes cleared Sarah WOF', body.commands[0].content.sarah.wof.dateText === null);

  /* --- status intents do not push --- */
  reset('ok');
  await invoke(intent('WhatsComingUpIntent', {}));
  ok('status intent does not push', pushCalls().length === 0);

  /* --- failures never break voice --- */
  reset('throw');
  res = await invoke(intent('SetRegoIntent', { date: { name: 'date', value: '2027-03-15' }, vehicle: vehicleSlot('cass') }));
  ok('network failure: voice response intact', /rego for Cass's car/.test(speech(res)), speech(res).slice(0, 80));

  widget._setConfig({ clientId: '', clientSecret: '', endpoint: '' });
  reset('ok');
  res = await invoke(intent('SetRegoIntent', { date: { name: 'date', value: '2027-04-15' }, vehicle: vehicleSlot('cass') }));
  ok('unconfigured: no HTTP calls', calls.length === 0);
  ok('unconfigured: voice response intact', /rego for Cass's car/.test(speech(res)));

  widget._setConfig({ clientId: 'amzn1.application-oa2-client.REPLACE_ME', clientSecret: 'REPLACE_ME', endpoint: '' });
  ok('placeholder config treated as unconfigured', !widget.isConfigured());
  widget._setConfig({ clientId: 'amzn1.application-oa2-client.test', clientSecret: 'secret', endpoint: '' });

  /* --- shipped config.js --- */
  const shipped = require(path.join(ROOT, 'lambda', 'config.js'));
  ok('shipped config.js has placeholders only', shipped.skillClientId === 'REPLACE_ME' && shipped.skillClientSecret === 'REPLACE_ME');
  widget._setConfig(null);
  ok('shipped config.js => widget push disabled (not configured)', !widget.isConfigured());
  widget._setConfig({ clientId: 'amzn1.application-oa2-client.test', clientSecret: 'secret', endpoint: '' });

  /* --- endpoint resolution --- */
  ok('endpoint from request apiEndpoint', widget.resolveEndpoint({ context: { System: { apiEndpoint: 'https://api.eu.amazonalexa.com' } } }, {}, {}) === 'https://api.eu.amazonalexa.com');
  ok('endpoint falls back to FE', widget.resolveEndpoint({ context: { System: {} } }, {}, {}) === FE);
  ok('rejects non-Alexa endpoint', widget.resolveEndpoint({ context: { System: { apiEndpoint: 'https://evil.example.com' } } }, {}, {}) === FE);

  /* --- launch refreshes widget; widget tap opens skill --- */
  reset('ok');
  res = await invoke(envelope({ type: 'LaunchRequest' }));
  ok('Launch refreshes widget', pushCalls().length === 1);

  reset('ok');
  res = await invoke(envelope({
    type: 'Alexa.Presentation.APL.UserEvent',
    arguments: ['openSkill'],
    source: { type: 'TouchWrapper', handler: 'Press', id: 'openSkillTouch' },
  }));
  ok('widget tap (UserEvent openSkill) opens skill summary', /Welcome back|Nothing is set/.test(speech(res)), speech(res).slice(0, 80));

  /* --- removal stops pushes --- */
  reset('ok');
  res = await invoke(noSession(envelope({
    type: 'Alexa.DataStore.PackageManager.UsagesRemoved',
    payload: { packageId: 'CarDueDatesWidget', packageVersion: '1.0.0', usages: [{ location: 'FAVORITE' }] },
  })));
  ok('UsagesRemoved silent + marks removed', !speech(res) && memoryStore[USER].widget.installed === false);
  reset('ok');
  await invoke(intent('SetWofIntent', { date: { name: 'date', value: '2027-07-01' }, vehicle: vehicleSlot('shane') }));
  ok('after removal: set does not push', pushCalls().length === 0);

  // Reinstall evidence in request context re-enables pushes
  reset('ok');
  const env = intent('SetWofIntent', { date: { name: 'date', value: '2027-07-02' }, vehicle: vehicleSlot('shane') });
  env.context['Alexa.DataStore.PackageManager'] = { installedPackages: [{ packageId: 'CarDueDatesWidget', packageVersion: '1.0.0' }] };
  await invoke(env);
  ok('installedPackages context re-enables push', pushCalls().length === 1);

  /* --- InstallationError / DataStore.Error --- */
  res = await invoke(noSession(envelope({
    type: 'Alexa.DataStore.PackageManager.InstallationError',
    packageId: 'CarDueDatesWidget',
    version: '1.0.0',
    error: { type: 'PACKAGEMANAGER_INTERNAL_ERROR', content: {} },
  })));
  ok('InstallationError handled silently', res && res.response && !speech(res));
  res = await invoke(noSession(envelope({
    type: 'Alexa.DataStore.Error',
    error: { type: 'DEVICE_UNAVAILABLE', content: { deviceId: 'x', commands: [] } },
  })));
  ok('Alexa.DataStore.Error handled silently', res && res.response && !speech(res));

  /* --- summary --- */
  const failed = results.filter((r) => !r.pass);
  console.log('\n--- Widget summary ---');
  console.log(`Passed: ${results.length - failed.length}/${results.length}`);
  if (failed.length) {
    failed.forEach((f) => console.log(' - FAIL', f.name, f.detail || ''));
    process.exitCode = 1;
  } else {
    console.log('All widget checks passed.');
  }
}

run().catch((e) => { console.error(e); process.exitCode = 1; });
