'use strict';

/**
 * Helpers for NZ car tracker: dates, vehicles, status colours, speech.
 * Timezone: device Settings API when available, else Pacific/Auckland.
 */

const DEFAULT_TIMEZONE = 'Pacific/Auckland';
const DEFAULT_VEHICLE = 'the car';

const STATUS = {
  GREEN: 'green',
  AMBER: 'amber',
  RED: 'red',
};

function getDefaultTimezone() {
  return DEFAULT_TIMEZONE;
}

/**
 * Resolve device timezone via UpsServiceClient; fall back to Pacific/Auckland.
 */
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

/**
 * "Today" as YYYY-MM-DD in the given IANA timezone.
 */
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

/**
 * Parse AMAZON.DATE slot values into a concrete YYYY-MM-DD.
 * Handles: YYYY-MM-DD, YYYY-MM, YYYY, XXXX-Wxx (week), weekends, seasons, decades.
 * Partial month/year → last day of that month (sensible for "expiry").
 */
function parseAlexaDate(slotValue, timezone) {
  if (!slotValue || typeof slotValue !== 'string') return null;
  const raw = slotValue.trim();
  const today = todayIso(timezone);

  // Exact date
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  // Month + year → last day of month (expiry-friendly)
  if (/^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split('-').map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }

  // Year only → 31 Dec
  if (/^\d{4}$/.test(raw)) {
    return `${raw}-12-31`;
  }

  // Week: 2026-W12 → Monday of that ISO week (or Friday for expiry feel — use Monday)
  const weekMatch = raw.match(/^(\d{4})-W(\d{2})(?:-WE)?$/);
  if (weekMatch) {
    const year = Number(weekMatch[1]);
    const week = Number(weekMatch[2]);
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const dayOfWeek = jan4.getUTCDay() || 7;
    const monday = new Date(jan4);
    monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1 + (week - 1) * 7);
    if (raw.endsWith('-WE')) {
      // weekend → Sunday of that week
      monday.setUTCDate(monday.getUTCDate() + 6);
    }
    return monday.toISOString().slice(0, 10);
  }

  // Decade: 202X → mid decade
  if (/^\d{3}X$/.test(raw)) {
    const decade = Number(raw.slice(0, 3) + '0');
    return `${decade + 5}-06-30`;
  }

  // Seasons: 2026-SP / SU / FA / WI
  const season = raw.match(/^(\d{4})-(SP|SU|FA|WI)$/);
  if (season) {
    const y = season[1];
    const map = { SP: `${y}-03-31`, SU: `${y}-06-30`, FA: `${y}-09-30`, WI: `${y}-12-31` };
    return map[season[2]];
  }

  // Relative tokens Alexa sometimes returns (present_ref etc.) — treat as today
  if (raw === 'PRESENT_REF' || raw.toLowerCase() === 'today') {
    return today;
  }

  return null;
}

/**
 * Days from today (in tz) to target YYYY-MM-DD. Negative = overdue.
 */
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

/**
 * Speak a date in NZ English style: "15 March 2026" / "15th of March".
 */
function speakDate(isoDate) {
  if (!isoDate) return 'an unknown date';
  const [y, m, d] = isoDate.split('-').map(Number);
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const day = d;
  const suffix = ordinalSuffix(day);
  return `${day}${suffix} of ${months[m - 1]} ${y}`;
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

function ensurePersistenceShape(attrs) {
  if (!attrs.vehicles || typeof attrs.vehicles !== 'object') {
    attrs.vehicles = {};
  }
  if (!attrs.defaultVehicle) {
    attrs.defaultVehicle = DEFAULT_VEHICLE;
  }
  if (!attrs.vehicles[attrs.defaultVehicle]) {
    attrs.vehicles[attrs.defaultVehicle] = emptyVehicle(attrs.defaultVehicle);
  }
  return attrs;
}

function emptyVehicle(nickname) {
  return {
    nickname: nickname || DEFAULT_VEHICLE,
    plate: null,
    regoExpiry: null,
    wofExpiry: null,
    lastService: null,
    nextService: null,
  };
}

/**
 * Resolve which vehicle the user meant from slots / defaults.
 */
function resolveVehicle(attrs, slots) {
  ensurePersistenceShape(attrs);
  const nick = slotString(slots, 'vehicle') ||
    slotString(slots, 'nickname') ||
    slotString(slots, 'plate');

  if (!nick) {
    const key = attrs.defaultVehicle || DEFAULT_VEHICLE;
    if (!attrs.vehicles[key]) {
      attrs.vehicles[key] = emptyVehicle(key);
    }
    return { key, vehicle: attrs.vehicles[key] };
  }

  const normalised = nick.trim().toLowerCase();
  // Exact / fuzzy match on nickname or plate
  for (const [key, v] of Object.entries(attrs.vehicles)) {
    if (key.toLowerCase() === normalised) {
      return { key, vehicle: v };
    }
    if (v.plate && String(v.plate).toLowerCase() === normalised) {
      return { key, vehicle: v };
    }
    if (v.nickname && String(v.nickname).toLowerCase() === normalised) {
      return { key, vehicle: v };
    }
  }

  // Create new vehicle under this nickname
  const key = normalised;
  attrs.vehicles[key] = emptyVehicle(normalised);
  if (Object.keys(attrs.vehicles).length === 1) {
    attrs.defaultVehicle = key;
  }
  return { key, vehicle: attrs.vehicles[key] };
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

/**
 * Build sorted "what's coming up" items across one or all vehicles.
 */
function collectDueItems(attrs, timezone, vehicleKey) {
  ensurePersistenceShape(attrs);
  const keys = vehicleKey ? [vehicleKey] : Object.keys(attrs.vehicles);
  const items = [];

  for (const key of keys) {
    const v = attrs.vehicles[key];
    if (!v) continue;
    const label = v.nickname || key;

    if (v.regoExpiry) {
      const days = daysUntil(v.regoExpiry, timezone);
      items.push({
        type: 'rego',
        label: 'Rego',
        vehicle: label,
        date: v.regoExpiry,
        days,
        colour: statusColour(days),
        spoken: `Rego for ${label} is due on ${speakDate(v.regoExpiry)}, ${speakDaysRemaining(days)}`,
      });
    }
    if (v.wofExpiry) {
      const days = daysUntil(v.wofExpiry, timezone);
      items.push({
        type: 'wof',
        label: 'WOF',
        vehicle: label,
        date: v.wofExpiry,
        days,
        colour: statusColour(days),
        spoken: `WOF for ${label} is due on ${speakDate(v.wofExpiry)}, ${speakDaysRemaining(days)}`,
      });
    }
    if (v.nextService && v.nextService.date) {
      const days = daysUntil(v.nextService.date, timezone);
      let extra = '';
      if (v.nextService.odometerKm) {
        extra = `, or at ${v.nextService.odometerKm} kilometres`;
      }
      items.push({
        type: 'service',
        label: 'Service',
        vehicle: label,
        date: v.nextService.date,
        days,
        colour: statusColour(days),
        spoken: `Service for ${label} is due on ${speakDate(v.nextService.date)}${extra}, ${speakDaysRemaining(days)}`,
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
    return `${lead}Nothing is set yet. You can say, set the rego expiry to the fifteenth of March, or set the WOF due date to June.`;
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

/**
 * Parse interval utterances into months (e.g. "every 6 months", "12 months", "annually").
 */
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
  // consentToken present historically; also check scopes if listed
  return !!(perms && (perms.consentToken || perms.scopes));
}

/**
 * Build absolute reminder scheduled datetime at 09:00 local for N days before due.
 */
function reminderTriggerIso(dueIso, daysBefore, timezone) {
  const days = daysUntil(dueIso, timezone);
  if (days === null) return null;
  const triggerDaysFromNow = days - daysBefore;
  if (triggerDaysFromNow < 0) {
    // already past preferred lead time — remind tomorrow 9am if still due in future
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
  // Scheduled absolute time as ISO with offset for Pacific/Auckland when possible
  const offset = aucklandOffsetFor(ymd);
  return `${ymd}T09:00:00${offset}`;
}

function aucklandOffsetFor(ymd) {
  // NZDT UTC+13 roughly late Sep–early Apr; NZST UTC+12 otherwise.
  // Use Intl to compute exact offset for that local noon.
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
      // e.g. "GMT+12" or "GMT+13"
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
  DEFAULT_VEHICLE,
  STATUS,
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
  resolveVehicle,
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
};
