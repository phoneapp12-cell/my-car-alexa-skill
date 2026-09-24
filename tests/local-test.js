'use strict';

/**
 * Local handler tests with in-memory persistence (no AWS / Alexa endpoints).
 * Run from repo root: node tests/local-test.js
 * Or: cd lambda && npm test
 */

const path = require('path');
const assert = require('assert');

process.env.USE_MEMORY_PERSISTENCE = '1';

// In-memory persistence adapter injected before loading the skill
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

const skillPath = path.join(__dirname, '..', 'lambda', 'index.js');
const util = require(path.join(__dirname, '..', 'lambda', 'util.js'));
const { handler } = require(skillPath);

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
          supportedInterfaces: {
            'Alexa.Presentation.APL': {},
          },
        },
        apiEndpoint: 'https://api.amazonalexa.com',
        apiAccessToken: 'TestToken',
      },
      Viewport: {
        width: 1920,
        height: 1080,
      },
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

async function run() {
  const results = [];
  function ok(name, cond, detail) {
    results.push({ name, pass: !!cond, detail: detail || '' });
    const mark = cond ? 'PASS' : 'FAIL';
    console.log(`[${mark}] ${name}${detail ? ' — ' + detail : ''}`);
  }

  // --- util unit checks ---
  assert.strictEqual(util.parseAlexaDate('2027-03-15', 'Pacific/Auckland'), '2027-03-15');
  assert.strictEqual(util.parseAlexaDate('2027-06', 'Pacific/Auckland'), '2027-06-30');
  assert.strictEqual(util.parseAlexaDate('2027', 'Pacific/Auckland'), '2027-12-31');
  ok('parseAlexaDate exact/partial', true);

  const days = util.daysUntil(util.addMonths(util.todayIso('Pacific/Auckland'), 2), 'Pacific/Auckland');
  ok('daysUntil future ~60', days >= 58 && days <= 62, `days=${days}`);

  ok('statusColour green', util.statusColour(45) === 'green');
  ok('statusColour amber', util.statusColour(10) === 'amber');
  ok('statusColour red', util.statusColour(-1) === 'red');

  // --- LaunchRequest ---
  let resp = await invoke(baseRequest());
  let speech = speechOf(resp);
  ok('LaunchRequest responds', !!speech, speech.slice(0, 120));
  ok('Launch mentions empty or welcome', /Welcome|set the rego|Nothing|not set|WOF|rego/i.test(speech), speech.slice(0, 160));
  ok('Launch includes APL on Show', hasApl(resp));

  // --- SetWofIntent ---
  resp = await invoke(baseRequest({
    session: { new: false },
    request: {
      type: 'IntentRequest',
      requestId: 'req-wof',
      timestamp: new Date().toISOString(),
      locale: 'en-AU',
      intent: {
        name: 'SetWofIntent',
        confirmationStatus: 'NONE',
        slots: {
          date: { name: 'date', value: '2027-06-01', confirmationStatus: 'NONE' },
          vehicle: { name: 'vehicle', confirmationStatus: 'NONE' },
        },
      },
    },
  }));
  speech = speechOf(resp);
  ok('SetWofIntent confirms date', /WOF|warrant/i.test(speech) && /June|first|1st/i.test(speech), speech.slice(0, 200));
  ok('SetWofIntent offers reminder', /remind/i.test(speech), speech.slice(0, 120));
  ok('SetWofIntent APL', hasApl(resp));

  // --- Status / WOF ---
  resp = await invoke(baseRequest({
    session: { new: false },
    request: {
      type: 'IntentRequest',
      requestId: 'req-status',
      timestamp: new Date().toISOString(),
      locale: 'en-AU',
      intent: {
        name: 'WofStatusIntent',
        confirmationStatus: 'NONE',
        slots: {
          vehicle: { name: 'vehicle', confirmationStatus: 'NONE' },
        },
      },
    },
  }));
  speech = speechOf(resp);
  ok('WofStatusIntent returns due date', /WOF/i.test(speech) && /2027|June/i.test(speech), speech.slice(0, 200));

  // --- WhatsComingUp / StatusIntent ---
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
        slots: {},
      },
    },
  }));
  speech = speechOf(resp);
  ok('WhatsComingUpIntent summarises', /coming up|WOF|due/i.test(speech), speech.slice(0, 200));

  // --- SetRegoIntent ---
  resp = await invoke(baseRequest({
    session: { new: false },
    request: {
      type: 'IntentRequest',
      requestId: 'req-rego',
      timestamp: new Date().toISOString(),
      locale: 'en-AU',
      intent: {
        name: 'SetRegoIntent',
        confirmationStatus: 'NONE',
        slots: {
          date: { name: 'date', value: '2027-03', confirmationStatus: 'NONE' },
          vehicle: { name: 'vehicle', confirmationStatus: 'NONE' },
        },
      },
    },
  }));
  speech = speechOf(resp);
  ok('SetRegoIntent partial month→last day', /rego/i.test(speech) && /March|31st|thirty.?first/i.test(speech), speech.slice(0, 200));

  // --- RecordServiceIntent ---
  resp = await invoke(baseRequest({
    session: { new: false },
    request: {
      type: 'IntentRequest',
      requestId: 'req-svc',
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
          vehicle: { name: 'vehicle', confirmationStatus: 'NONE' },
        },
      },
    },
  }));
  speech = speechOf(resp);
  ok('RecordServiceIntent records + next', /service/i.test(speech) && /45000|forty|kilometre/i.test(speech), speech.slice(0, 220));

  // --- interaction model validation ---
  const model = require(path.join(__dirname, '..', 'skill-package', 'interactionModels', 'custom', 'en-AU.json'));
  ok('invocation name is car due dates', model.interactionModel.languageModel.invocationName === 'car due dates');

  const samples = [];
  const dupes = [];
  const seen = new Map();
  for (const intent of model.interactionModel.languageModel.intents) {
    for (const s of intent.samples || []) {
      const key = s.toLowerCase().trim();
      samples.push({ intent: intent.name, sample: s });
      if (seen.has(key)) {
        dupes.push({ sample: s, a: seen.get(key), b: intent.name });
      } else {
        seen.set(key, intent.name);
      }
    }
  }
  ok('no duplicate sample utterances across intents', dupes.length === 0, dupes.length ? JSON.stringify(dupes.slice(0, 5)) : `${samples.length} samples`);

  const failed = results.filter((r) => !r.pass);
  console.log('\n--- Summary ---');
  console.log(`Passed: ${results.length - failed.length}/${results.length}`);
  if (failed.length) {
    console.log('Failures:');
    failed.forEach((f) => console.log(' -', f.name, f.detail));
    process.exitCode = 1;
  } else {
    console.log('All checks passed.');
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
