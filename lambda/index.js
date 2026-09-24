'use strict';

const Alexa = require('ask-sdk-core');
const { S3PersistenceAdapter } = require('ask-sdk-s3-persistence-adapter');
const util = require('./util');
const apl = require('./aplDocument');

const REMINDER_PERMISSION = 'alexa::alerts:reminders:skill:readwrite';

const HELP_TEXT =
  'I track rego, WOF, and servicing for Sarah\'s car, Shane\'s car, and Cass\'s car. ' +
  'Try: set the WOF on Sarah\'s car to the first of June. ' +
  'Or: record a service on Shane\'s car today at forty five thousand kilometres. ' +
  'Ask: what\'s coming up, when\'s the WOF due, or when\'s the rego due on Cass\'s car. ' +
  'You can clear the rego, WOF, or service on a named car.';

async function loadAttrs(handlerInput) {
  const attrs = (await handlerInput.attributesManager.getPersistentAttributes()) || {};
  return util.ensurePersistenceShape(attrs);
}

async function saveAttrs(handlerInput, attrs) {
  handlerInput.attributesManager.setPersistentAttributes(attrs);
  await handlerInput.attributesManager.savePersistentAttributes();
}

function getSlots(handlerInput) {
  const req = handlerInput.requestEnvelope.request;
  return (req.intent && req.intent.slots) || {};
}

async function withAplIfSupported(handlerInput, speech, reprompt, attrs, timezone) {
  const rb = handlerInput.responseBuilder.speak(speech);
  if (reprompt) rb.reprompt(reprompt);
  if (util.supportsApl(handlerInput)) {
    rb.addDirective(apl.buildAplDirective(attrs, timezone));
  }
  return rb.getResponse();
}

/** Elicit vehicle slot; keeps other filled slots via updatedIntent. */
function elicitVehicle(handlerInput, speech) {
  const intent = handlerInput.requestEnvelope.request.intent;
  return handlerInput.responseBuilder
    .speak(speech || util.ELICIT_VEHICLE_SPEECH)
    .reprompt(util.ELICIT_VEHICLE_SPEECH)
    .addElicitSlotDirective('vehicle', intent)
    .getResponse();
}

function requireVehicle(handlerInput, attrs, slots) {
  const resolved = util.resolveVehicle(attrs, slots);
  if (!resolved.key) return null;
  return resolved;
}

/* ---------- Launch ---------- */

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  async handle(handlerInput) {
    const timezone = await util.getTimezone(handlerInput);
    const attrs = await loadAttrs(handlerInput);
    const items = util.collectDueItems(attrs, timezone);
    const speech = items.length
      ? util.summariseItems(items, 'Welcome back. Here\'s what\'s due next across all three cars.')
      : 'Welcome to Car Due Dates. Nothing is set yet for Sarah\'s, Shane\'s, or Cass\'s car. Say, for example, set the WOF on Sarah\'s car to June.';
    const reprompt = 'You can set a date on a named car, or ask what\'s coming up.';
    return withAplIfSupported(handlerInput, speech, reprompt, attrs, timezone);
  },
};

/* ---------- Set Rego ---------- */

const SetRegoIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'SetRegoIntent';
  },
  async handle(handlerInput) {
    const timezone = await util.getTimezone(handlerInput);
    const slots = getSlots(handlerInput);
    const attrs = await loadAttrs(handlerInput);

    const resolved = requireVehicle(handlerInput, attrs, slots);
    if (!resolved) return elicitVehicle(handlerInput);

    const dateRaw = util.slotString(slots, 'date');
    const parsed = util.parseAlexaDate(dateRaw, timezone);
    if (!parsed) {
      return handlerInput.responseBuilder
        .speak('When does the rego expire? For example, the fifteenth of March twenty twenty seven.')
        .reprompt('When does the rego expire?')
        .addElicitSlotDirective('date', handlerInput.requestEnvelope.request.intent)
        .getResponse();
    }

    const { key, vehicle } = resolved;
    vehicle.regoExpiry = parsed;
    attrs.vehicles[key] = vehicle;
    const label = util.displayName(key);
    attrs.pendingReminder = {
      type: 'rego',
      date: parsed,
      vehicleKey: key,
      daysBefore: 14,
      prompt: true,
    };
    await saveAttrs(handlerInput, attrs);

    const days = util.daysUntil(parsed, timezone);
    const speech =
      `Got it. I've set the rego for ${label} to expire on ${util.speakDate(parsed)}. ` +
      `${util.speakDaysRemaining(days)}. Would you like a reminder two weeks before?`;
    return withAplIfSupported(
      handlerInput,
      speech,
      'Would you like a reminder two weeks before the rego expires?',
      attrs,
      timezone
    );
  },
};

/* ---------- Set WOF ---------- */

const SetWofIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'SetWofIntent';
  },
  async handle(handlerInput) {
    const timezone = await util.getTimezone(handlerInput);
    const slots = getSlots(handlerInput);
    const attrs = await loadAttrs(handlerInput);

    const resolved = requireVehicle(handlerInput, attrs, slots);
    if (!resolved) return elicitVehicle(handlerInput);

    const dateRaw = util.slotString(slots, 'date');
    const parsed = util.parseAlexaDate(dateRaw, timezone);
    if (!parsed) {
      return handlerInput.responseBuilder
        .speak('When is the WOF due? For example, June twenty twenty seven, or the first of June.')
        .reprompt('When is the WOF due?')
        .addElicitSlotDirective('date', handlerInput.requestEnvelope.request.intent)
        .getResponse();
    }

    const { key, vehicle } = resolved;
    vehicle.wofExpiry = parsed;
    attrs.vehicles[key] = vehicle;
    const label = util.displayName(key);
    attrs.pendingReminder = {
      type: 'wof',
      date: parsed,
      vehicleKey: key,
      daysBefore: 14,
      prompt: true,
    };
    await saveAttrs(handlerInput, attrs);

    const days = util.daysUntil(parsed, timezone);
    const speech =
      `Confirmed. ${label} WOF is due on ${util.speakDate(parsed)}. ` +
      `${util.speakDaysRemaining(days)}. Want a reminder two weeks before?`;
    return withAplIfSupported(
      handlerInput,
      speech,
      'Would you like a WOF reminder two weeks before?',
      attrs,
      timezone
    );
  },
};

/* ---------- Record Service ---------- */

const RecordServiceIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'RecordServiceIntent';
  },
  async handle(handlerInput) {
    const timezone = await util.getTimezone(handlerInput);
    const slots = getSlots(handlerInput);
    const attrs = await loadAttrs(handlerInput);

    const resolved = requireVehicle(handlerInput, attrs, slots);
    if (!resolved) return elicitVehicle(handlerInput);

    const dateRaw = util.slotString(slots, 'date');
    const serviceDate = util.parseAlexaDate(dateRaw, timezone) || util.todayIso(timezone);
    const odo = util.slotNumber(slots, 'odometer');
    const nextDateRaw = util.slotString(slots, 'nextDate');
    const intervalRaw = util.slotString(slots, 'interval');
    const nextKm = util.slotNumber(slots, 'nextOdometer');

    const { key, vehicle } = resolved;
    const label = util.displayName(key);

    vehicle.lastService = { date: serviceDate, odometerKm: odo };

    let nextServiceDate = util.parseAlexaDate(nextDateRaw, timezone);
    const intervalMonths = util.parseIntervalMonths(intervalRaw);
    if (!nextServiceDate && intervalMonths) {
      nextServiceDate = util.addMonths(serviceDate, intervalMonths);
    }

    if (nextServiceDate || nextKm || intervalMonths) {
      vehicle.nextService = {
        date: nextServiceDate || null,
        odometerKm: nextKm || null,
        intervalMonths: intervalMonths || null,
      };
    }

    attrs.vehicles[key] = vehicle;

    let speech = `Recorded a service for ${label} on ${util.speakDate(serviceDate)}`;
    if (odo !== null) speech += ` at ${odo} kilometres`;
    speech += '.';

    if (vehicle.nextService && vehicle.nextService.date) {
      const days = util.daysUntil(vehicle.nextService.date, timezone);
      speech += ` Next service is due on ${util.speakDate(vehicle.nextService.date)}, ${util.speakDaysRemaining(days)}.`;
      attrs.pendingReminder = {
        type: 'service',
        date: vehicle.nextService.date,
        vehicleKey: key,
        daysBefore: 7,
        prompt: true,
      };
      speech += ' Shall I remind you one week before?';
      await saveAttrs(handlerInput, attrs);
      return withAplIfSupported(
        handlerInput,
        speech,
        'Would you like a service reminder one week before?',
        attrs,
        timezone
      );
    }

    if (vehicle.nextService && vehicle.nextService.odometerKm) {
      speech += ` Next service at ${vehicle.nextService.odometerKm} kilometres.`;
    } else {
      speech += ' You can also say when the next service is due, for example every six months.';
    }

    await saveAttrs(handlerInput, attrs);
    return withAplIfSupported(handlerInput, speech, 'Anything else?', attrs, timezone);
  },
};

/* ---------- Set Next Service ---------- */

const SetNextServiceIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'SetNextServiceIntent';
  },
  async handle(handlerInput) {
    const timezone = await util.getTimezone(handlerInput);
    const slots = getSlots(handlerInput);
    const attrs = await loadAttrs(handlerInput);

    const resolved = requireVehicle(handlerInput, attrs, slots);
    if (!resolved) return elicitVehicle(handlerInput);

    const dateRaw = util.slotString(slots, 'date');
    const intervalRaw = util.slotString(slots, 'interval');
    const nextKm = util.slotNumber(slots, 'nextOdometer');
    const intervalMonths = util.parseIntervalMonths(intervalRaw);

    let nextDate = util.parseAlexaDate(dateRaw, timezone);
    const { key, vehicle } = resolved;
    const label = util.displayName(key);

    if (!nextDate && intervalMonths && vehicle.lastService && vehicle.lastService.date) {
      nextDate = util.addMonths(vehicle.lastService.date, intervalMonths);
    }
    if (!nextDate && intervalMonths) {
      nextDate = util.addMonths(util.todayIso(timezone), intervalMonths);
    }

    if (!nextDate && !nextKm) {
      return handlerInput.responseBuilder
        .speak('When is the next service due? You can say a date, or every six months, or a kilometre reading.')
        .reprompt('When is the next service due?')
        .getResponse();
    }

    vehicle.nextService = {
      date: nextDate || (vehicle.nextService && vehicle.nextService.date) || null,
      odometerKm: nextKm || (vehicle.nextService && vehicle.nextService.odometerKm) || null,
      intervalMonths: intervalMonths || (vehicle.nextService && vehicle.nextService.intervalMonths) || null,
    };
    attrs.vehicles[key] = vehicle;

    let speech = `Okay. Next service for ${label}`;
    if (vehicle.nextService.date) {
      speech += ` is due on ${util.speakDate(vehicle.nextService.date)}`;
    }
    if (vehicle.nextService.odometerKm) {
      speech += `${vehicle.nextService.date ? ', or' : ' is due'} at ${vehicle.nextService.odometerKm} kilometres`;
    }
    speech += '.';

    if (vehicle.nextService.date) {
      attrs.pendingReminder = {
        type: 'service',
        date: vehicle.nextService.date,
        vehicleKey: key,
        daysBefore: 7,
        prompt: true,
      };
      speech += ' Want a reminder one week before?';
      await saveAttrs(handlerInput, attrs);
      return withAplIfSupported(handlerInput, speech, 'Would you like a reminder?', attrs, timezone);
    }

    await saveAttrs(handlerInput, attrs);
    return withAplIfSupported(handlerInput, speech, 'Anything else?', attrs, timezone);
  },
};

/* ---------- Status ---------- */

const StatusIntentHandler = {
  canHandle(handlerInput) {
    if (Alexa.getRequestType(handlerInput.requestEnvelope) !== 'IntentRequest') return false;
    const name = Alexa.getIntentName(handlerInput.requestEnvelope);
    return name === 'StatusIntent' || name === 'WhatsComingUpIntent' ||
      name === 'RegoStatusIntent' || name === 'WofStatusIntent' || name === 'ServiceStatusIntent';
  },
  async handle(handlerInput) {
    const timezone = await util.getTimezone(handlerInput);
    const attrs = await loadAttrs(handlerInput);
    const slots = getSlots(handlerInput);
    const intent = Alexa.getIntentName(handlerInput.requestEnvelope);
    const vehicleId = util.resolveVehicleId(slots);

    let typeFilter = null;
    if (intent === 'RegoStatusIntent') typeFilter = 'rego';
    else if (intent === 'WofStatusIntent') typeFilter = 'wof';
    else if (intent === 'ServiceStatusIntent') typeFilter = 'service';

    const items = util.collectDueItems(attrs, timezone, vehicleId || null, typeFilter);

    if (!items.length) {
      let speech;
      if (typeFilter === 'rego') {
        speech = vehicleId
          ? `I don't have a rego date for ${util.displayName(vehicleId)} yet.`
          : 'I don\'t have any rego dates set yet for Sarah\'s, Shane\'s, or Cass\'s car.';
      } else if (typeFilter === 'wof') {
        speech = vehicleId
          ? `I don't have a WOF date for ${util.displayName(vehicleId)} yet.`
          : 'I don\'t have any WOF dates set yet for Sarah\'s, Shane\'s, or Cass\'s car.';
      } else if (typeFilter === 'service') {
        speech = vehicleId
          ? `I don't have a next service date for ${util.displayName(vehicleId)} yet.`
          : 'I don\'t have any next service dates set yet.';
      } else {
        speech = 'Nothing is set yet. Say, for example, set the WOF on Sarah\'s car to June.';
      }
      return withAplIfSupported(handlerInput, speech, 'Anything else?', attrs, timezone);
    }

    const intro = intent === 'WhatsComingUpIntent' || intent === 'StatusIntent'
      ? (vehicleId ? `Here's the status for ${util.displayName(vehicleId)}.` : 'Here\'s what\'s coming up.')
      : (vehicleId ? '' : 'Across all three cars:');

    const speech = util.summariseItems(items, intro);
    return withAplIfSupported(handlerInput, speech, 'Anything else?', attrs, timezone);
  },
};

/* ---------- Clear / Delete ---------- */

const ClearIntentHandler = {
  canHandle(handlerInput) {
    if (Alexa.getRequestType(handlerInput.requestEnvelope) !== 'IntentRequest') return false;
    const name = Alexa.getIntentName(handlerInput.requestEnvelope);
    return name === 'ClearIntent' || name === 'DeleteIntent';
  },
  async handle(handlerInput) {
    const timezone = await util.getTimezone(handlerInput);
    const attrs = await loadAttrs(handlerInput);
    const slots = getSlots(handlerInput);

    const resolved = requireVehicle(handlerInput, attrs, slots);
    if (!resolved) return elicitVehicle(handlerInput);

    const { key, vehicle } = resolved;
    const label = util.displayName(key);
    const itemType = (util.slotString(slots, 'itemType') || '').toLowerCase();

    let speech;
    if (/rego|registration/.test(itemType)) {
      vehicle.regoExpiry = null;
      speech = `Cleared the rego date for ${label}.`;
    } else if (/wof|warrant/.test(itemType)) {
      vehicle.wofExpiry = null;
      speech = `Cleared the WOF date for ${label}.`;
    } else if (/service/.test(itemType)) {
      vehicle.nextService = null;
      vehicle.lastService = null;
      speech = `Cleared the service dates for ${label}.`;
    } else if (/all|everything/.test(itemType)) {
      attrs.vehicles[key] = util.emptyVehicle(key);
      speech = `Cleared all dates for ${label}.`;
    } else {
      return handlerInput.responseBuilder
        .speak('What should I clear — rego, WOF, service, or all?')
        .reprompt('Rego, WOF, service, or all?')
        .addElicitSlotDirective('itemType', handlerInput.requestEnvelope.request.intent)
        .getResponse();
    }

    attrs.vehicles[key] = /all|everything/.test(itemType) ? attrs.vehicles[key] : vehicle;
    attrs.pendingReminder = null;
    await saveAttrs(handlerInput, attrs);
    return withAplIfSupported(handlerInput, speech, 'Anything else?', attrs, timezone);
  },
};

/* ---------- Yes / No for reminders ---------- */

const YesIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.YesIntent';
  },
  async handle(handlerInput) {
    const attrs = await loadAttrs(handlerInput);
    const pending = attrs.pendingReminder;
    if (!pending || !pending.prompt) {
      return handlerInput.responseBuilder
        .speak('Okay. You can ask what\'s coming up, or set a date on a named car.')
        .reprompt('What would you like to do?')
        .getResponse();
    }

    if (!util.hasRemindersPermission(handlerInput)) {
      attrs.pendingReminder = { ...pending, awaitingPermission: true };
      await saveAttrs(handlerInput, attrs);
      return handlerInput.responseBuilder
        .speak('I need permission to set reminders. I\'ll ask Alexa for that now.')
        .addDirective({
          type: 'Connections.SendRequest',
          name: 'AskFor',
          payload: {
            '@type': 'AskForPermissionsConsentRequest',
            '@version': '2',
            permissionScopes: [
              { permissionScope: REMINDER_PERMISSION, consentLevel: 'ACCOUNT' },
            ],
          },
          token: 'remindersFromYes',
        })
        .getResponse();
    }

    return createPendingReminder(handlerInput, attrs, pending);
  },
};

const NoIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.NoIntent';
  },
  async handle(handlerInput) {
    const attrs = await loadAttrs(handlerInput);
    if (attrs.pendingReminder) {
      attrs.pendingReminder = null;
      await saveAttrs(handlerInput, attrs);
      return handlerInput.responseBuilder
        .speak('No worries. I won\'t set a reminder. Anything else?')
        .reprompt('Anything else?')
        .getResponse();
    }
    return handlerInput.responseBuilder.speak('Okay.').getResponse();
  },
};

async function createPendingReminder(handlerInput, attrs, pending) {
  const timezone = await util.getTimezone(handlerInput);
  const trigger = util.reminderTriggerIso(pending.date, pending.daysBefore || 14, timezone);
  const label = util.displayName(pending.vehicleKey);
  if (!trigger) {
    attrs.pendingReminder = null;
    await saveAttrs(handlerInput, attrs);
    return handlerInput.responseBuilder
      .speak('That date is too soon for the usual lead time, so I skipped the reminder. Your date is still saved.')
      .reprompt('Anything else?')
      .getResponse();
  }

  const typeLabel = pending.type === 'wof' ? 'WOF' : pending.type === 'rego' ? 'rego' : 'service';
  const text = `${label} ${typeLabel} is due on ${util.speakDate(pending.date)}.`;

  try {
    const client = handlerInput.serviceClientFactory.getReminderManagementServiceClient();
    const scheduledLocal = String(trigger).replace(/([+-]\d{2}:\d{2}|Z)$/, '');
    await client.createReminder({
      requestTime: new Date().toISOString().split('.')[0],
      trigger: {
        type: 'SCHEDULED_ABSOLUTE',
        scheduledTime: scheduledLocal,
        timeZoneId: timezone,
      },
      alertInfo: {
        spokenInfo: {
          content: [{ locale: 'en-AU', text }],
        },
      },
      pushNotification: { status: 'ENABLED' },
    });
    attrs.pendingReminder = null;
    await saveAttrs(handlerInput, attrs);
    return handlerInput.responseBuilder
      .speak(`Done. I'll remind you about ${label} ${typeLabel} at nine a.m., ${pending.daysBefore || 14} days before.`)
      .reprompt('Anything else?')
      .getResponse();
  } catch (err) {
    const status = err && (err.statusCode || err.code);
    if (status === 401 || status === 403) {
      attrs.pendingReminder = { ...pending, awaitingPermission: true };
      await saveAttrs(handlerInput, attrs);
      return handlerInput.responseBuilder
        .speak('I need permission to set reminders. I\'ll ask Alexa for that now.')
        .addDirective({
          type: 'Connections.SendRequest',
          name: 'AskFor',
          payload: {
            '@type': 'AskForPermissionsConsentRequest',
            '@version': '2',
            permissionScopes: [
              { permissionScope: REMINDER_PERMISSION, consentLevel: 'ACCOUNT' },
            ],
          },
          token: 'remindersAfterError',
        })
        .getResponse();
    }
    attrs.pendingReminder = null;
    await saveAttrs(handlerInput, attrs);
    return handlerInput.responseBuilder
      .speak('I couldn\'t create that reminder right now, but your date is saved.')
      .reprompt('Anything else?')
      .getResponse();
  }
}

const ConnectionsResponseHandler = {
  canHandle(handlerInput) {
    const req = handlerInput.requestEnvelope.request;
    return req.type === 'Connections.Response' && req.name === 'AskFor';
  },
  async handle(handlerInput) {
    const attrs = await loadAttrs(handlerInput);
    const pending = attrs.pendingReminder;
    const payload = handlerInput.requestEnvelope.request.payload || {};
    const scopes = payload.permissionScopes || [];
    const status = (scopes[0] && scopes[0].status) || payload.status || '';

    if (String(status).toUpperCase() === 'ACCEPTED' || String(status).toUpperCase() === 'GRANTED') {
      if (pending) return createPendingReminder(handlerInput, attrs, pending);
      return handlerInput.responseBuilder
        .speak('Thanks. Reminders permission is on.')
        .getResponse();
    }

    attrs.pendingReminder = null;
    await saveAttrs(handlerInput, attrs);
    return handlerInput.responseBuilder
      .speak('No problem — I won\'t set reminders. Your dates are still saved.')
      .reprompt('Anything else?')
      .getResponse();
  },
};

const HelpIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak(HELP_TEXT)
      .reprompt('What would you like to do?')
      .getResponse();
  },
};

const CancelAndStopIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent' ||
        Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak('Goodbye.')
      .withShouldEndSession(true)
      .getResponse();
  },
};

const FallbackIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak('Sorry, I didn\'t get that. ' + HELP_TEXT)
      .reprompt('Try asking what\'s coming up, or set a WOF on a named car.')
      .getResponse();
  },
};

const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder.getResponse();
  },
};

const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.log(`Error handled: ${error && error.message}`);
    console.log(error && error.stack);
    return handlerInput.responseBuilder
      .speak('Sorry, something went wrong. Please try again.')
      .reprompt('What would you like to do?')
      .getResponse();
  },
};

function buildPersistenceAdapter() {
  if (process.env.USE_MEMORY_PERSISTENCE === '1' && global.__carTrackerMemoryAdapter) {
    return global.__carTrackerMemoryAdapter;
  }
  const bucket = process.env.S3_PERSISTENCE_BUCKET;
  if (!bucket) {
    const store = {};
    return {
      async getAttributes(requestEnvelope) {
        const id = Alexa.getUserId(requestEnvelope) || 'local';
        return store[id] ? JSON.parse(JSON.stringify(store[id])) : {};
      },
      async saveAttributes(requestEnvelope, attributes) {
        const id = Alexa.getUserId(requestEnvelope) || 'local';
        store[id] = JSON.parse(JSON.stringify(attributes));
      },
      async deleteAttributes(requestEnvelope) {
        const id = Alexa.getUserId(requestEnvelope) || 'local';
        delete store[id];
      },
    };
  }
  return new S3PersistenceAdapter({
    bucketName: bucket,
    pathPrefix: 'car-tracker',
  });
}

const skillBuilder = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    SetRegoIntentHandler,
    SetWofIntentHandler,
    RecordServiceIntentHandler,
    SetNextServiceIntentHandler,
    StatusIntentHandler,
    ClearIntentHandler,
    YesIntentHandler,
    NoIntentHandler,
    ConnectionsResponseHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    FallbackIntentHandler,
    SessionEndedRequestHandler
  )
  .addErrorHandlers(ErrorHandler)
  .withPersistenceAdapter(buildPersistenceAdapter())
  .withApiClient(new Alexa.DefaultApiClient());

exports.handler = skillBuilder.lambda();
exports.skillBuilder = skillBuilder;
exports.buildPersistenceAdapter = buildPersistenceAdapter;
exports.HELP_TEXT = HELP_TEXT;
