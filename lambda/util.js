'use strict';

/**
 * Helpers for NZ car tracker: dates, three named vehicles, status colours, speech.
 * Timezone: device Settings API when available, else Pacific/Auckland.
 */

const DEFAULT_TIMEZONE = 'Pacific/Auckland';

/** Canonical cars — keys are entity-resolution IDs. */
const VEHICLES = {
  sarah: { id: 'sarah', nickname: "Sarah's car" },
  shane: { id: 'shane', nickname: "Shane's car" },
  cass: { id: 'cass', nickname: "Cass's car" },
};

const VEHICLE_ORDER = ['sarah', 'shane', 'cass'];

/** Synonym → id (lowercase). "my car" is intentionally NOT mapped. */
const VEHICLE_ALIASES = {
  sarah: 'sarah',
  "sarah's": 'sarah',
  "sarah's car": 'sarah',
  'sarahs car': 'sarah',
  'sarah car': 'sarah',
  shane: 'shane',
  "shane's": 'shane',
  "shane's car": 'shane',
  'shanes car': 'shane',
  'shane car': 'shane',
  cass: 'cass',
  "cass's": 'cass',
  "cass's car": 'cass',
  'casss car': 'cass',
  'cass car': 'cass',
  cassie: 'cass',
  "cassie's": 'cass',
  "cassie's car": 'cass',
};

const LEGACY_KEYS = ['the car', 'car', 'default', 'the vehicle', 'my car'];

const STATUS = {
  GREEN: 'green',
  AMBER: 'amber',
  RED: 'red',
};

const ELICIT_VEHICLE_SPEECH =
  "Which car — Sarah's, Shane's, or Cass's?";

function getDefaultTimezone() {
  return DEFAULT_TIMEZONE;
}

async function getTimezone(handlerInput) {
  try {
    const deviceId = handlerInput.requestEnvelope.context.System.device.deviceId;
    const ups = handlerInput.serviceClientFactory &&
      handlerInput.serviceClientFactory.getUpsServiceClient();
    if (ups && deviceId) {
      const tz = await ups.getSystemTimeZone(deviceId);
      if (tz) return tz;
    }
  } catch (err) {
    // fall through
  }
  return DEFAULT_TIMEZONE;
}

function todayIso(timezone) {
  const tz = timezone || DEFAULT_TIMEZONE;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === 'year').value;
    const m = parts.find((p) => p.type === 'month').value;
    const d = parts.find((p) => p.type === 'day').value;
    return `${y}-${m}-${d}`;
  } catch (e) {
    return new Date().toISOString().slice(0, 10);
  }
}

function parseAlexaDate(slotValue, timezone) {
  if (!slotValue || typeof slotValue !== 'string') return null;
  const raw = slotValue.trim();
  const today = todayIso(timezone);

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  if (/^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split('-').map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }

  if (/^\d{4}$/.test(raw)) return `${raw}-12-31`;

  const weekMatch = raw.match(/^(\d{4})-W(\d{2})(?:-WE)?$/);
  if (weekMatch) {
    const year = Number(weekMatch[1]);
    const week = Number(weekMatch[2]);
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const dayOfWeek = jan4.getUTCDay() || 7;
    const monday = new Date(jan4);
    monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1 + (week - 1) * 7);
    if (raw.endsWith('-WE')) monday.setUTCDate(monday.getUTCDate() + 6);
    return monday.toISOString().slice(0, 10);
  }

  if (/^\d{3}X$/.test(raw)) {
    const decade = Number(raw.slice(0, 3) + '0');
    return `${decade + 5}-06-30`;
  }

  const season = raw.match(/^(\d{4})-(SP|SU|FA|WI)$/);
  if (season) {
    const y = season[1];
    const map = { SP: `${y}-03-31`, SU: `${y}-06-30`, FA: `${y}-09-30`, WI: `${y}-12-31` };
    return map[season[2]];
  }

  if (raw === 'PRESENT_REF' || raw.toLowerCase() === 'today') return today;
  return null;
}

function daysUntil(isoDate, timezone) {
  if (!isoDate) return null;
  const today = todayIso(timezone);
  const t0 = Date.parse(`${today}T12:00:00Z`);
  const t1 = Date.parse(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(t0) || Number.isNaN(t1)) return null;
  return Math.round((t1 - t0) / 86400000);
}

function statusColour(days) {
  if (days === null || days === undefined) return STATUS.AMBER;
  if (days < 0) return STATUS.RED;
  if (days <= 30) return STATUS.AMBER;
  return STATUS.GREEN;
}

function speakDate(isoDate) {
  if (!isoDate) return 'an unknown date';
  const [y, m, d] = isoDate.split('-').map(Number);
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${d}${ordinalSuffix(d)} of ${months[m - 1]} ${y}`;
}

function ordinalSuffix(n) {
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) return 'st';
  if (j === 2 && k !== 12) return 'nd';
  if (j === 3 && k !== 13) return 'rd';
  return 'th';
}

function speakDaysRemaining(days) {
  if (days === null || days === undefined) return '';
  if (days < 0) {
    const n = Math.abs(days);
    return n === 1 ? 'overdue by 1 day' : `overdue by ${n} days`;
  }
  if (days === 0) return 'due today';
  if (days === 1) return '1 day remaining';
  return `${days} days remaining`;
}

function emptyVehicle(id) {
  const meta = VEHICLES[id] || { id, nickname: id };
  return {
    id: meta.id,
    nickname: meta.nickname,
    plate: null,
    regoExpiry: null,
    wofExpiry: null,
    lastService: null,
    nextService: null,
  };
}

function vehicleHasData(v) {
  if (!v) return false;
  return !!(v.regoExpiry || v.wofExpiry ||
    (v.lastService && (v.lastService.date || v.lastService.odometerKm)) ||
    (v.nextService && (v.nextService.date || v.nextService.odometerKm)));
}

/**
 * Migrate legacy single-vehicle data ("the car", etc.) onto Shane's car.
 * Always ensure sarah / shane / cass exist.
 */
function ensurePersistenceShape(attrs) {
  if (!attrs.vehicles || typeof attrs.vehicles !== 'object') {
    attrs.vehicles = {};
  }

  // Migrate legacy keys → shane (once)
  if (!attrs._migratedToThreeCars) {
    for (const legacy of LEGACY_KEYS) {
      if (attrs.vehicles[legacy] && vehicleHasData(attrs.vehicles[legacy])) {
        const legacyData = attrs.vehicles[legacy];
        const shane = attrs.vehicles.shane || emptyVehicle('shane');
        // Merge only empty fields on shane so we don't wipe newer data
        if (!shane.regoExpiry && legacyData.regoExpiry) shane.regoExpiry = legacyData.regoExpiry;
        if (!shane.wofExpiry && legacyData.wofExpiry) shane.wofExpiry = legacyData.wofExpiry;
        if (!shane.lastService && legacyData.lastService) shane.lastService = legacyData.lastService;
        if (!shane.nextService && legacyData.nextService) shane.nextService = legacyData.nextService;
        shane.id = 'shane';
        shane.nickname = VEHICLES.shane.nickname;
        attrs.vehicles.shane = shane;
      }
      if (attrs.vehicles[legacy]) delete attrs.vehicles[legacy];
    }
    // Also migrate if defaultVehicle pointed at a non-canonical key with data
    const def = attrs.defaultVehicle;
    if (def && !VEHICLES[def] && attrs.vehicles[def] && vehicleHasData(attrs.vehicles[def])) {
      const legacyData = attrs.vehicles[def];
      const shane = attrs.vehicles.shane || emptyVehicle('shane');
      if (!shane.regoExpiry && legacyData.regoExpiry) shane.regoExpiry = legacyData.regoExpiry;
      if (!shane.wofExpiry && legacyData.wofExpiry) shane.wofExpiry = legacyData.wofExpiry;
      if (!shane.lastService && legacyData.lastService) shane.lastService = legacyData.lastService;
      if (!shane.nextService && legacyData.nextService) shane.nextService = legacyData.nextService;
      shane.id = 'shane';
      shane.nickname = VEHICLES.shane.nickname;
      attrs.vehicles.shane = shane;
      delete attrs.vehicles[def];
    }
    attrs._migratedToThreeCars = true;
  }

  // Drop any other non-canonical keys (keep data? migrate unknown single leftover to shane)
  for (const key of Object.keys(attrs.vehicles)) {
    if (!VEHICLES[key]) {
      if (vehicleHasData(attrs.vehicles[key])) {
        const legacyData = attrs.vehicles[key];
        const shane = attrs.vehicles.shane || emptyVehicle('shane');
        if (!shane.regoExpiry && legacyData.regoExpiry) shane.regoExpiry = legacyData.regoExpiry;
        if (!shane.wofExpiry && legacyData.wofExpiry) shane.wofExpiry = legacyData.wofExpiry;
        if (!shane.lastService && legacyData.lastService) shane.lastService = legacyData.lastService;
        if (!shane.nextService && legacyData.nextService) shane.nextService = legacyData.nextService;
        attrs.vehicles.shane = shane;
      }
      delete attrs.vehicles[key];
    }
  }

  for (const id of VEHICLE_ORDER) {
    if (!attrs.vehicles[id]) {
      attrs.vehicles[id] = emptyVehicle(id);
    } else {
      attrs.vehicles[id].id = id;
      attrs.vehicles[id].nickname = VEHICLES[id].nickname;
    }
  }

  attrs.defaultVehicle = null; // never silently pick a car for set/clear
  return attrs;
}

function displayName(keyOrVehicle) {
  if (!keyOrVehicle) return 'the car';
  if (typeof keyOrVehicle === 'string') {
    return (VEHICLES[keyOrVehicle] && VEHICLES[keyOrVehicle].nickname) || keyOrVehicle;
  }
  return keyOrVehicle.nickname || (VEHICLES[keyOrVehicle.id] && VEHICLES[keyOrVehicle.id].nickname) || 'the car';
}

/**
 * Extract vehicle entity-resolution id from the vehicle slot, or null.
 */
function resolveVehicleId(slots) {
  if (!slots || !slots.vehicle) return null;
  const slot = slots.vehicle;

  // Prefer entity resolution id
  try {
    const authorities = slot.resolutions && slot.resolutions.resolutionsPerAuthority;
    if (authorities && authorities.length) {
      for (const auth of authorities) {
        if (auth.status && String(auth.status.code).includes('ER_SUCCESS_MATCH') &&
          auth.values && auth.values[0] && auth.values[0].value) {
          const id = auth.values[0].value.id;
          if (id && VEHICLES[id]) return id;
          const name = auth.values[0].value.name;
          const mapped = mapAlias(name);
          if (mapped) return mapped;
        }
      }
    }
  } catch (e) {
    // fall through
  }

  if (slot.value) {
    return mapAlias(slot.value);
  }
  return null;
}

function mapAlias(raw) {
  if (!raw) return null;
  const n = String(raw).trim().toLowerCase().replace(/\s+/g, ' ');
  if (VEHICLES[n]) return n;
  if (VEHICLE_ALIASES[n]) return VEHICLE_ALIASES[n];
  // strip trailing "car"
  const stripped = n.replace(/'s\b/g, 's').replace(/\s+car$/, '');
  if (VEHICLE_ALIASES[stripped]) return VEHICLE_ALIASES[stripped];
  if (VEHICLE_ALIASES[`${stripped} car`]) return VEHICLE_ALIASES[`${stripped} car`];
  return null;
}

/**
 * Resolve vehicle; returns { key, vehicle } or { key: null, vehicle: null } if missing.
 */
function resolveVehicle(attrs, slots) {
  ensurePersistenceShape(attrs);
  const id = resolveVehicleId(slots);
  if (!id) return { key: null, vehicle: null };
  if (!attrs.vehicles[id]) attrs.vehicles[id] = emptyVehicle(id);
  return { key: id, vehicle: attrs.vehicles[id] };
}

function slotString(slots, name) {
  if (!slots || !slots[name] || !slots[name].value) return null;
  return String(slots[name].value).trim();
}

function slotNumber(slots, name) {
  const s = slotString(slots, name);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function collectDueItems(attrs, timezone, vehicleKey, typeFilter) {
  ensurePersistenceShape(attrs);
  const keys = vehicleKey ? [vehicleKey] : VEHICLE_ORDER.slice();
  const items = [];

  for (const key of keys) {
    const v = attrs.vehicles[key];
    if (!v) continue;
    const label = displayName(key);

    if ((!typeFilter || typeFilter === 'rego') && v.regoExpiry) {
      const days = daysUntil(v.regoExpiry, timezone);
      items.push({
        type: 'rego',
        label: 'Rego',
        vehicleKey: key,
        vehicle: label,
        date: v.regoExpiry,
        days,
        colour: statusColour(days),
        spoken: `${label} rego is due on ${speakDate(v.regoExpiry)}, ${speakDaysRemaining(days)}`,
      });
    }
    if ((!typeFilter || typeFilter === 'wof') && v.wofExpiry) {
      const days = daysUntil(v.wofExpiry, timezone);
      items.push({
        type: 'wof',
        label: 'WOF',
        vehicleKey: key,
        vehicle: label,
        date: v.wofExpiry,
        days,
        colour: statusColour(days),
        spoken: `${label} WOF is due on ${speakDate(v.wofExpiry)}, ${speakDaysRemaining(days)}`,
      });
    }
    if ((!typeFilter || typeFilter === 'service') && v.nextService && v.nextService.date) {
      const days = daysUntil(v.nextService.date, timezone);
      let extra = '';
      if (v.nextService.odometerKm) {
        extra = `, or at ${v.nextService.odometerKm} kilometres`;
      }
      items.push({
        type: 'service',
        label: 'Service',
        vehicleKey: key,
        vehicle: label,
        date: v.nextService.date,
        days,
        colour: statusColour(days),
        spoken: `${label} service is due on ${speakDate(v.nextService.date)}${extra}, ${speakDaysRemaining(days)}`,
      });
    }
  }

  items.sort((a, b) => {
    if (a.days === null) return 1;
    if (b.days === null) return -1;
    return a.days - b.days;
  });
  return items;
}

function summariseItems(items, intro) {
  if (!items.length) {
    const lead = intro ? `${intro} ` : '';
    return `${lead}Nothing is set yet. Say, for example, set the WOF on Sarah's car to June.`;
  }
  const overdue = items.filter((i) => i.days !== null && i.days < 0);
  const parts = items.map((i) => i.spoken);
  let speech = intro ? `${intro} ` : '';
  if (overdue.length) {
    speech += `Heads up: ${overdue.length === 1 ? 'one item is' : overdue.length + ' items are'} overdue. `;
  }
  speech += parts.join('. ') + '.';
  return speech;
}

function addMonths(isoDate, months) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCMonth(dt.getUTCMonth() + months);
  return dt.toISOString().slice(0, 10);
}

function parseIntervalMonths(raw) {
  if (!raw) return null;
  const s = String(raw).toLowerCase();
  if (/annual|year|12\s*month/.test(s)) return 12;
  if (/6\s*month|half\s*year|bi.?annual/.test(s)) return 6;
  if (/3\s*month|quarter/.test(s)) return 3;
  if (/24\s*month|two\s*year/.test(s)) return 24;
  const m = s.match(/(\d+)\s*month/);
  if (m) return Number(m[1]);
  return null;
}

function supportsApl(handlerInput) {
  const ifaces = handlerInput.requestEnvelope.context &&
    handlerInput.requestEnvelope.context.System &&
    handlerInput.requestEnvelope.context.System.device &&
    handlerInput.requestEnvelope.context.System.device.supportedInterfaces;
  return !!(ifaces && ifaces['Alexa.Presentation.APL']);
}

function hasRemindersPermission(handlerInput) {
  const perms = handlerInput.requestEnvelope.context.System.user.permissions;
  return !!(perms && (perms.consentToken || perms.scopes));
}

function reminderTriggerIso(dueIso, daysBefore, timezone) {
  const days = daysUntil(dueIso, timezone);
  if (days === null) return null;
  const triggerDaysFromNow = days - daysBefore;
  if (triggerDaysFromNow < 0) {
    if (days < 0) return null;
    return localNineAmIso(1, timezone);
  }
  return localNineAmIso(triggerDaysFromNow, timezone);
}

function localNineAmIso(daysFromToday, timezone) {
  const tz = timezone || DEFAULT_TIMEZONE;
  const today = todayIso(tz);
  const base = Date.parse(`${today}T00:00:00Z`) + daysFromToday * 86400000;
  const ymd = new Date(base).toISOString().slice(0, 10);
  const offset = aucklandOffsetFor(ymd);
  return `${ymd}T09:00:00${offset}`;
}

function aucklandOffsetFor(ymd) {
  try {
    const probe = new Date(`${ymd}T12:00:00Z`);
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Pacific/Auckland',
      timeZoneName: 'shortOffset',
      hour: '2-digit',
      hourCycle: 'h23',
    });
    const parts = fmt.formatToParts(probe);
    const tzName = parts.find((p) => p.type === 'timeZoneName');
    if (tzName && tzName.value) {
      const m = tzName.value.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/);
      if (m) {
        const h = Number(m[1]);
        const mm = m[2] || '00';
        const sign = h >= 0 ? '+' : '-';
        const abs = String(Math.abs(h)).padStart(2, '0');
        return `${sign}${abs}:${mm}`;
      }
    }
  } catch (e) {
    // fall through
  }
  return '+12:00';
}

module.exports = {
  DEFAULT_TIMEZONE,
  VEHICLES,
  VEHICLE_ORDER,
  VEHICLE_ALIASES,
  STATUS,
  ELICIT_VEHICLE_SPEECH,
  getDefaultTimezone,
  getTimezone,
  todayIso,
  parseAlexaDate,
  daysUntil,
  statusColour,
  speakDate,
  speakDaysRemaining,
  ensurePersistenceShape,
  emptyVehicle,
  displayName,
  resolveVehicleId,
  resolveVehicle,
  mapAlias,
  slotString,
  slotNumber,
  collectDueItems,
  summariseItems,
  addMonths,
  parseIntervalMonths,
  supportsApl,
  hasRemindersPermission,
  reminderTriggerIso,
  localNineAmIso,
  vehicleHasData,
};
