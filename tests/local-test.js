'use strict';

/**
 * Local handler tests with in-memory persistence (no AWS / Alexa endpoints).
 */

const path = require('path');
const assert = require('assert');

process.env.USE_MEMORY_PERSISTENCE = '1';

const memoryStore = {};
global.__carTrackerMemoryAdapter = {
  async getAttributes(requestEnvelope) {
    const id = (requestEnvelope.context &&
      requestEnvelope.context.System &&
      requestEnvelope.context.System.user &&
      requestEnvelope.context.System.user.userId) || 'test-user';
    return memoryStore[id] ? JSON.parse(JSON.stringify(memoryStore[id])) : {};
  },
  async saveAttributes(requestEnvelope, attributes) {
    const id = (requestEnvelope.context &&
      requestEnvelope.context.System &&
      requestEnvelope.context.System.user &&
      requestEnvelope.context.System.user.userId) || 'test-user';
    memoryStore[id] = JSON.parse(JSON.stringify(attributes));
  },
  async deleteAttributes(requestEnvelope) {
    const id = (requestEnvelope.context &&
      requestEnvelope.context.System &&
      requestEnvelope.context.System.user &&
      requestEnvelope.context.System.user.userId) || 'test-user';
    delete memoryStore[id];
  },
};

const util = require(path.join(__dirname, '..', 'lambda', 'util.js'));
const apl = require(path.join(__dirname, '..', 'lambda', 'aplDocument.js'));
const { handler } = require(path.join(__dirname, '..', 'lambda', 'index.js'));

function deepMerge(a, b) {
  if (!b) return a;
  const out = Array.isArray(a) ? a.slice() : { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof out[k] === 'object' && out[k]) {
      out[k] = deepMerge(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function baseRequest(overrides) {
  const req = {
    version: '1.0',
    session: {
      new: true,
      sessionId: 'SessionId.test',
      application: { applicationId: 'amzn1.ask.skill.test' },
      user: { userId: 'amzn1.ask.account.testuser' },
    },
    context: {
      System: {
        application: { applicationId: 'amzn1.ask.skill.test' },
        user: {
          userId: 'amzn1.ask.account.testuser',
          permissions: { consentToken: 'TestConsentToken' },
        },
        device: {
          deviceId: 'amzn1.ask.device.test',
          supportedInterfaces: { 'Alexa.Presentation.APL': {} },
        },
        apiEndpoint: 'https://api.amazonalexa.com',
        apiAccessToken: 'TestToken',
      },
      Viewport: { width: 1920, height: 1080 },
    },
    request: {
      type: 'LaunchRequest',
      requestId: 'EdwRequestId.test',
      timestamp: new Date().toISOString(),
      locale: 'en-AU',
    },
  };
  return deepMerge(req, overrides || {});
}

function vehicleSlot(id, spoken) {
  const name = util.VEHICLES[id].nickname;
  return {
    name: 'vehicle',
    value: spoken || name,
    confirmationStatus: 'NONE',
    resolutions: {
      resolutionsPerAuthority: [
        {
          authority: 'amzn1.er-authority.test.VEHICLE_NAME',
          status: { code: 'ER_SUCCESS_MATCH' },
          values: [{ value: { name, id } }],
        },
      ],
    },
  };
}

function emptyVehicleSlot() {
  return { name: 'vehicle', confirmationStatus: 'NONE' };
}

function invoke(event) {
  return new Promise((resolve, reject) => {
    handler(event, {}, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

function speechOf(response) {
  const ssml = response && response.response && response.response.outputSpeech &&
    response.response.outputSpeech.ssml;
  return (ssml || '').replace(/<\/?speak>/g, '');
}

function hasApl(response) {
  const dirs = (response.response && response.response.directives) || [];
  return dirs.some((d) => d.type === 'Alexa.Presentation.APL.RenderDocument');
}

function elicitSlot(response) {
  const dirs = (response.response && response.response.directives) || [];
  const d = dirs.find((x) => x.type === 'Dialog.ElicitSlot');
  return d && d.slotToElicit;
}

function aplColumns(response) {
  const dirs = (response.response && response.response.directives) || [];
  const d = dirs.find((x) => x.type === 'Alexa.Presentation.APL.RenderDocument');
  return d && d.datasources && d.datasources.dashboardData && d.datasources.dashboardData.columns;
}

async function run() {
  const results = [];
  function ok(name, cond, detail) {
    results.push({ name, pass: !!cond, detail: detail || '' });
    console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
  }

  // Clear store between logical groups
  Object.keys(memoryStore).forEach((k) => delete memoryStore[k]);

  // --- util ---
  assert.strictEqual(util.parseAlexaDate('2027-03-15', 'Pacific/Auckland'), '2027-03-15');
  assert.strictEqual(util.parseAlexaDate('2027-06', 'Pacific/Auckland'), '2027-06-30');
  ok('parseAlexaDate', true);
  ok('mapAlias sarah', util.mapAlias("sarah's") === 'sarah');
  ok('mapAlias cassie', util.mapAlias('cassie') === 'cass');
  ok('my car is NOT an alias', util.mapAlias('my car') === null);

  // Migration
  const legacy = {
    vehicles: {
      'the car': {
        nickname: 'the car',
        regoExpiry: '2027-01-01',
        wofExpiry: '2027-02-01',
        lastService: null,
        nextService: null,
      },
    },
    defaultVehicle: 'the car',
  };
  util.ensurePersistenceShape(legacy);
  ok('migrate legacy to shane', legacy.vehicles.shane && legacy.vehicles.shane.regoExpiry === '2027-01-01');
  ok('three cars present', !!(legacy.vehicles.sarah && legacy.vehicles.shane && legacy.vehicles.cass));
  ok('legacy key removed', !legacy.vehicles['the car']);

  // --- Launch empty ---
  let resp = await invoke(baseRequest());
  let speech = speechOf(resp);
  ok('Launch empty mentions three cars', /Sarah|Shane|Cass/i.test(speech), speech.slice(0, 160));
  ok('Launch APL three columns', hasApl(resp) && aplColumns(resp) && aplColumns(resp).length === 3);

  // --- Missing vehicle elicits ---
  resp = await invoke(baseRequest({
    session: { new: false },
    request: {
      type: 'IntentRequest',
      requestId: 'req-wof-nov',
      timestamp: new Date().toISOString(),
      locale: 'en-AU',
      intent: {
        name: 'SetWofIntent',
        confirmationStatus: 'NONE',
        slots: {
          date: { name: 'date', value: '2027-06-01', confirmationStatus: 'NONE' },
          vehicle: emptyVehicleSlot(),
        },
      },
    },
  }));
  speech = speechOf(resp);
  ok('SetWof without car elicits vehicle', elicitSlot(resp) === 'vehicle', speech.slice(0, 120));
  ok('Elicit keeps asking which car', /Sarah|Shane|Cass/i.test(speech));

  // --- Set WOF on Sarah's car ---
  resp = await invoke(baseRequest({
    session: { new: false },
    request: {
      type: 'IntentRequest',
      requestId: 'req-wof-sarah',
      timestamp: new Date().toISOString(),
      locale: 'en-AU',
      intent: {
        name: 'SetWofIntent',
        confirmationStatus: 'NONE',
        slots: {
          date: { name: 'date', value: '2027-06-01', confirmationStatus: 'NONE' },
          vehicle: vehicleSlot('sarah', "Sarah's car"),
        },
      },
    },
  }));
  speech = speechOf(resp);
  ok('SetWof Sarah confirms', /Sarah/i.test(speech) && /WOF/i.test(speech) && /June/i.test(speech), speech.slice(0, 200));
  ok('SetWof offers reminder', /remind/i.test(speech));

  // Decline reminder so we can continue cleanly
  await invoke(baseRequest({
    session: { new: false },
    request: {
      type: 'IntentRequest',
      requestId: 'req-no',
      timestamp: new Date().toISOString(),
      locale: 'en-AU',
      intent: { name: 'AMAZON.NoIntent', confirmationStatus: 'NONE', slots: {} },
    },
  }));

  // --- Set Rego on Cass ---
  resp = await invoke(baseRequest({
    session: { new: false },
    request: {
      type: 'IntentRequest',
      requestId: 'req-rego-cass',
      timestamp: new Date().toISOString(),
      locale: 'en-AU',
      intent: {
        name: 'SetRegoIntent',
        confirmationStatus: 'NONE',
        slots: {
          date: { name: 'date', value: '2027-03', confirmationStatus: 'NONE' },
          vehicle: vehicleSlot('cass'),
        },
      },
    },
  }));
  speech = speechOf(resp);
  ok('SetRego Cass partial month', /Cass/i.test(speech) && /March|31st/i.test(speech), speech.slice(0, 200));
  await invoke(baseRequest({
    session: { new: false },
    request: {
      type: 'IntentRequest',
      requestId: 'req-no2',
      timestamp: new Date().toISOString(),
      locale: 'en-AU',
      intent: { name: 'AMAZON.NoIntent', confirmationStatus: 'NONE', slots: {} },
    },
  }));

  // --- Record service on Shane ---
  resp = await invoke(baseRequest({
    session: { new: false },
    request: {
      type: 'IntentRequest',
      requestId: 'req-svc-shane',
      timestamp: new Date().toISOString(),
      locale: 'en-AU',
      intent: {
        name: 'RecordServiceIntent',
        confirmationStatus: 'NONE',
        slots: {
          date: { name: 'date', value: '2026-09-24', confirmationStatus: 'NONE' },
          odometer: { name: 'odometer', value: '45000', confirmationStatus: 'NONE' },
          interval: { name: 'interval', value: '6 months', confirmationStatus: 'NONE' },
          nextDate: { name: 'nextDate', confirmationStatus: 'NONE' },
          nextOdometer: { name: 'nextOdometer', confirmationStatus: 'NONE' },
          vehicle: vehicleSlot('shane'),
        },
      },
    },
  }));
  speech = speechOf(resp);
  ok('RecordService Shane', /Shane/i.test(speech) && /45000|kilometre/i.test(speech), speech.slice(0, 220));
  await invoke(baseRequest({
    session: { new: false },
    request: {
      type: 'IntentRequest',
      requestId: 'req-no3',
      timestamp: new Date().toISOString(),
      locale: 'en-AU',
      intent: { name: 'AMAZON.NoIntent', confirmationStatus: 'NONE', slots: {} },
    },
  }));

  // --- WOF status without car → all cars that have WOF ---
  resp = await invoke(baseRequest({
    session: { new: false },
    request: {
      type: 'IntentRequest',
      requestId: 'req-wof-all',
      timestamp: new Date().toISOString(),
      locale: 'en-AU',
      intent: {
        name: 'WofStatusIntent',
        confirmationStatus: 'NONE',
        slots: { vehicle: emptyVehicleSlot() },
      },
    },
  }));
  speech = speechOf(resp);
  ok('WofStatus all cars mentions Sarah', /Sarah/i.test(speech) && /WOF/i.test(speech), speech.slice(0, 200));

  // --- Whats coming up across cars ---
  resp = await invoke(baseRequest({
    session: { new: false },
    request: {
      type: 'IntentRequest',
      requestId: 'req-coming',
      timestamp: new Date().toISOString(),
      locale: 'en-AU',
      intent: {
        name: 'WhatsComingUpIntent',
        confirmationStatus: 'NONE',
        slots: { vehicle: emptyVehicleSlot() },
      },
    },
  }));
  speech = speechOf(resp);
  ok('WhatsComingUp multi-car', /Sarah/i.test(speech) && /Cass|Shane/i.test(speech), speech.slice(0, 280));
  const cols = aplColumns(resp);
  ok('APL columns named', cols && cols.every((c) => /Sarah|Shane|Cass/.test(c.carName)));
  ok('APL rows per column', cols && cols[0].rows.length === 3);

  // --- Clear without vehicle elicits ---
  resp = await invoke(baseRequest({
    session: { new: false },
    request: {
      type: 'IntentRequest',
      requestId: 'req-clear-nov',
      timestamp: new Date().toISOString(),
      locale: 'en-AU',
      intent: {
        name: 'ClearIntent',
        confirmationStatus: 'NONE',
        slots: {
          itemType: { name: 'itemType', value: 'rego', confirmationStatus: 'NONE' },
          vehicle: emptyVehicleSlot(),
        },
      },
    },
  }));
  ok('Clear without car elicits', elicitSlot(resp) === 'vehicle');

  // --- Clear rego on Shane (none set — still ok) / clear WOF on Sarah ---
  resp = await invoke(baseRequest({
    session: { new: false },
    request: {
      type: 'IntentRequest',
      requestId: 'req-clear-sarah',
      timestamp: new Date().toISOString(),
      locale: 'en-AU',
      intent: {
        name: 'ClearIntent',
        confirmationStatus: 'NONE',
        slots: {
          itemType: { name: 'itemType', value: 'WOF', confirmationStatus: 'NONE' },
          vehicle: vehicleSlot('sarah'),
        },
      },
    },
  }));
  speech = speechOf(resp);
  ok('Clear WOF Sarah', /Cleared/i.test(speech) && /Sarah/i.test(speech), speech.slice(0, 120));

  // Reminder text unit check via pending shape
  ok('displayName sarah', util.displayName('sarah') === "Sarah's car");

  // --- interaction model ---
  const model = require(path.join(__dirname, '..', 'skill-package', 'interactionModels', 'custom', 'en-AU.json'));
  ok('invocation car due dates', model.interactionModel.languageModel.invocationName === 'car due dates');

  const vehicleType = model.interactionModel.languageModel.types.find((t) => t.name === 'VEHICLE_NAME');
  const ids = (vehicleType.values || []).map((v) => v.id).sort();
  ok('VEHICLE_NAME exactly sarah/shane/cass', ids.join(',') === 'cass,sarah,shane', ids.join(','));
  const shaneSyn = vehicleType.values.find((v) => v.id === 'shane').name.synonyms || [];
  ok('my car not a Shane synonym', !shaneSyn.map((s) => s.toLowerCase()).includes('my car'));

  const samples = [];
  const dupes = [];
  const seen = new Map();
  for (const intent of model.interactionModel.languageModel.intents) {
    const slotNames = new Set((intent.slots || []).map((s) => s.name));
    for (const s of intent.samples || []) {
      const key = s.toLowerCase().strip ? s.toLowerCase().strip() : s.toLowerCase().trim();
      samples.push({ intent: intent.name, sample: s });
      if (seen.has(key)) dupes.push({ sample: s, a: seen.get(key), b: intent.name });
      else seen.set(key, intent.name);
      // slot names in samples must be defined
      const used = s.match(/\{(\w+)\}/g) || [];
      for (const u of used) {
        const n = u.slice(1, -1);
        if (!slotNames.has(n)) {
          ok(`slot ${n} missing on ${intent.name}`, false, s);
        }
      }
    }
  }
  ok('no duplicate samples', dupes.length === 0, dupes.length ? JSON.stringify(dupes.slice(0, 3)) : `${samples.length} samples`);

  // Dialog vehicle elicitation present
  const dialogIntents = model.interactionModel.dialog.intents.map((i) => i.name);
  ok('dialog covers set/record/clear',
    ['SetRegoIntent', 'SetWofIntent', 'RecordServiceIntent', 'ClearIntent'].every((n) => dialogIntents.includes(n)));

  const failed = results.filter((r) => !r.pass);
  console.log('\n--- Summary ---');
  console.log(`Passed: ${results.length - failed.length}/${results.length}`);
  if (failed.length) {
    failed.forEach((f) => console.log(' - FAIL', f.name, f.detail));
    process.exitCode = 1;
  } else {
    console.log('All checks passed.');
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
