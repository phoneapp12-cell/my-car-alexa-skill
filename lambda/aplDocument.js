'use strict';

/**
 * APL dashboard for Echo Show 15 (1920x1080): three columns (Sarah / Shane / Cass),
 * each with Rego, WOF, Service rows. Large text for across-the-room readability.
 */

const util = require('./util');

const COLOURS = {
  green: { bg: '#1B5E20', accent: '#A5D6A7', label: 'OK' },
  amber: { bg: '#E65100', accent: '#FFE0B2', label: 'SOON' },
  red: { bg: '#B71C1C', accent: '#FFCDD2', label: 'OVERDUE' },
  empty: { bg: '#263238', accent: '#90A4AE', label: 'NOT SET' },
};

function buildAplDocument() {
  return {
    type: 'APL',
    version: '1.9',
    license: 'Private use — Shane Jenkins car due dates',
    settings: { idleTimeout: 120000 },
    theme: 'dark',
    import: [{ name: 'alexa-layouts', version: '1.6.0' }],
    mainTemplate: {
      parameters: ['payload'],
      items: [
        {
          type: 'Container',
          width: '100vw',
          height: '100vh',
          direction: 'column',
          paddingTop: 20,
          paddingBottom: 16,
          paddingLeft: 24,
          paddingRight: 24,
          backgroundColor: '#0D1117',
          items: [
            {
              type: 'Container',
              width: '100%',
              direction: 'row',
              justifyContent: 'spaceBetween',
              alignItems: 'center',
              paddingBottom: 12,
              items: [
                {
                  type: 'Text',
                  text: '${payload.dashboardData.title}',
                  fontSize: '42dp',
                  color: '#FFFFFF',
                  fontWeight: '700',
                },
                {
                  type: 'Text',
                  text: '${payload.dashboardData.subtitle}',
                  fontSize: '22dp',
                  color: '#B0BEC5',
                },
              ],
            },
            {
              type: 'Container',
              width: '100%',
              grow: 1,
              direction: 'row',
              justifyContent: 'spaceBetween',
              data: '${payload.dashboardData.columns}',
              items: [
                {
                  type: 'Container',
                  width: '32%',
                  height: '100%',
                  direction: 'column',
                  padding: 12,
                  backgroundColor: '#161B22',
                  borderRadius: 14,
                  items: [
                    {
                      type: 'Text',
                      text: '${data.carName}',
                      fontSize: '32dp',
                      fontWeight: '700',
                      color: '#FFFFFF',
                      textAlign: 'center',
                      paddingBottom: 10,
                    },
                    {
                      type: 'Container',
                      width: '100%',
                      grow: 1,
                      direction: 'column',
                      justifyContent: 'spaceBetween',
                      data: '${data.rows}',
                      items: [
                        {
                          type: 'Container',
                          width: '100%',
                          height: '30%',
                          padding: 14,
                          borderRadius: 10,
                          backgroundColor: '${data.bg}',
                          direction: 'column',
                          justifyContent: 'center',
                          items: [
                            {
                              type: 'Container',
                              direction: 'row',
                              justifyContent: 'spaceBetween',
                              width: '100%',
                              items: [
                                {
                                  type: 'Text',
                                  text: '${data.label}',
                                  fontSize: '26dp',
                                  fontWeight: '700',
                                  color: '#FFFFFF',
                                },
                                {
                                  type: 'Text',
                                  text: '${data.badge}',
                                  fontSize: '20dp',
                                  fontWeight: '700',
                                  color: '${data.accent}',
                                },
                              ],
                            },
                            {
                              type: 'Text',
                              text: '${data.dateText}',
                              fontSize: '30dp',
                              fontWeight: '700',
                              color: '#FFFFFF',
                              paddingTop: 6,
                            },
                            {
                              type: 'Text',
                              text: '${data.daysText}',
                              fontSize: '22dp',
                              color: '#ECEFF1',
                              paddingTop: 4,
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              type: 'Text',
              text: '${payload.dashboardData.footer}',
              fontSize: '18dp',
              color: '#78909C',
              paddingTop: 10,
              textAlign: 'center',
            },
          ],
        },
      ],
    },
  };
}

function formatShortDate(isoDate) {
  if (!isoDate) return 'Not set';
  const [y, m, d] = isoDate.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(d)} ${months[Number(m) - 1]} ${y}`;
}

function rowFromItem(typeLabel, item) {
  if (!item) {
    const c = COLOURS.empty;
    return {
      label: typeLabel,
      badge: c.label,
      bg: c.bg,
      accent: c.accent,
      dateText: 'Not set',
      daysText: '—',
    };
  }
  const c = COLOURS[item.colour] || COLOURS.amber;
  let daysText;
  if (item.days < 0) {
    daysText = `Overdue ${Math.abs(item.days)}d`;
  } else if (item.days === 0) {
    daysText = 'Due today';
  } else {
    daysText = `${item.days} days left`;
  }
  return {
    label: typeLabel,
    badge: c.label,
    bg: c.bg,
    accent: c.accent,
    dateText: formatShortDate(item.date),
    daysText,
  };
}

/**
 * Build three-column dashboard from persistent attrs (all cars).
 */
function buildDashboardData(attrs, timezone) {
  util.ensurePersistenceShape(attrs);
  const today = util.todayIso(timezone);
  const columns = util.VEHICLE_ORDER.map((id) => {
    const v = attrs.vehicles[id];
    const items = util.collectDueItems(attrs, timezone, id);
    const byType = { rego: null, wof: null, service: null };
    for (const it of items) byType[it.type] = it;
    return {
      carName: util.displayName(id),
      rows: [
        rowFromItem('Rego', byType.rego),
        rowFromItem('WOF', byType.wof),
        rowFromItem('Service', byType.service),
      ],
    };
  });

  return {
    title: 'Car Due Dates',
    subtitle: `Today ${today}`,
    footer: 'Green >30 days · Amber ≤30 · Red overdue · Say a car name when setting dates',
    columns,
  };
}

function buildAplDirective(attrs, timezone) {
  return {
    type: 'Alexa.Presentation.APL.RenderDocument',
    token: 'carTrackerDashboard',
    document: buildAplDocument(),
    datasources: {
      dashboardData: buildDashboardData(attrs, timezone),
    },
  };
}

module.exports = {
  buildAplDocument,
  buildDashboardData,
  buildAplDirective,
  COLOURS,
};
