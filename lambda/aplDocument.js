'use strict';

/**
 * APL dashboard for Echo Show 15 (1920x1080 landscape) and other APL devices.
 * Colour status: green >30 days, amber <=30, red overdue.
 */

const COLOURS = {
  green: {
    bg: '#1B5E20',
    accent: '#66BB6A',
    label: 'OK',
  },
  amber: {
    bg: '#E65100',
    accent: '#FFB74D',
    label: 'SOON',
  },
  red: {
    bg: '#B71C1C',
    accent: '#EF5350',
    label: 'OVERDUE',
  },
  empty: {
    bg: '#37474F',
    accent: '#90A4AE',
    label: 'NOT SET',
  },
};

function buildAplDocument() {
  return {
    type: 'APL',
    version: '1.9',
    license: 'Private use — Shane Jenkins car tracker',
    settings: {
      idleTimeout: 120000,
    },
    theme: 'dark',
    import: [
      {
        name: 'alexa-layouts',
        version: '1.6.0',
      },
    ],
    mainTemplate: {
      parameters: ['payload'],
      items: [
        {
          type: 'Container',
          width: '100vw',
          height: '100vh',
          direction: 'column',
          paddingTop: 24,
          paddingBottom: 24,
          paddingLeft: 32,
          paddingRight: 32,
          items: [
            {
              type: 'Container',
              width: '100%',
              direction: 'row',
              justifyContent: 'spaceBetween',
              alignItems: 'center',
              paddingBottom: 16,
              items: [
                {
                  type: 'Text',
                  text: '${payload.dashboardData.title}',
                  style: 'textStyleDisplay4',
                  color: '#FFFFFF',
                  fontWeight: '700',
                },
                {
                  type: 'Text',
                  text: '${payload.dashboardData.subtitle}',
                  style: 'textStyleBody',
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
              data: '${payload.dashboardData.cards}',
              items: [
                {
                  type: 'Container',
                  width: '32%',
                  height: '100%',
                  padding: 20,
                  backgroundColor: '${data.bg}',
                  borderRadius: 16,
                  direction: 'column',
                  items: [
                    {
                      type: 'Text',
                      text: '${data.label}',
                      style: 'textStyleTitle',
                      color: '#FFFFFF',
                      fontWeight: '700',
                    },
                    {
                      type: 'Text',
                      text: '${data.badge}',
                      style: 'textStyleCaption',
                      color: '${data.accent}',
                      fontWeight: '700',
                      paddingTop: 4,
                      paddingBottom: 12,
                    },
                    {
                      type: 'Text',
                      text: '${data.dateText}',
                      style: 'textStyleDisplay5',
                      color: '#FFFFFF',
                      paddingTop: 8,
                    },
                    {
                      type: 'Text',
                      text: '${data.daysText}',
                      style: 'textStyleBody',
                      color: '#ECEFF1',
                      paddingTop: 12,
                    },
                    {
                      type: 'Text',
                      text: '${data.detail}',
                      style: 'textStyleCaption',
                      color: '#CFD8DC',
                      paddingTop: 16,
                    },
                  ],
                },
              ],
            },
            {
              type: 'Text',
              text: '${payload.dashboardData.footer}',
              style: 'textStyleCaption',
              color: '#78909C',
              paddingTop: 16,
              textAlign: 'center',
            },
          ],
        },
      ],
    },
  };
}

/**
 * Build APL datasource cards for rego / WOF / service for one vehicle (or merged).
 */
function buildDashboardData(items, vehicleLabel, timezoneToday) {
  const byType = {
    rego: null,
    wof: null,
    service: null,
  };
  for (const item of items) {
    if (byType[item.type] === null || byType[item.type] === undefined) {
      byType[item.type] = item;
    }
  }

  const cards = ['rego', 'wof', 'service'].map((type) => {
    const titles = { rego: 'Rego', wof: 'WOF', service: 'Service' };
    const item = byType[type];
    if (!item) {
      const c = COLOURS.empty;
      return {
        label: titles[type],
        badge: c.label,
        bg: c.bg,
        accent: c.accent,
        dateText: '—',
        daysText: 'Not set yet',
        detail: `Say: set the ${type === 'wof' ? 'WOF' : type} date`,
      };
    }
    const c = COLOURS[item.colour] || COLOURS.amber;
    let daysText;
    if (item.days < 0) {
      daysText = `Overdue by ${Math.abs(item.days)} day${Math.abs(item.days) === 1 ? '' : 's'}`;
    } else if (item.days === 0) {
      daysText = 'Due today';
    } else {
      daysText = `${item.days} day${item.days === 1 ? '' : 's'} left`;
    }
    const [y, m, d] = item.date.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dateText = `${Number(d)} ${months[Number(m) - 1]} ${y}`;
    return {
      label: titles[type],
      badge: c.label,
      bg: c.bg,
      accent: c.accent,
      dateText,
      daysText,
      detail: item.vehicle && item.vehicle !== 'the car' ? item.vehicle : '',
    };
  });

  return {
    title: 'My Car',
    subtitle: vehicleLabel ? String(vehicleLabel) : 'Dashboard',
    footer: `Today ${timezoneToday || ''} · Green >30 days · Amber ≤30 · Red overdue`,
    cards,
  };
}

function buildAplDirective(items, vehicleLabel, todayIso) {
  return {
    type: 'Alexa.Presentation.APL.RenderDocument',
    token: 'carTrackerDashboard',
    document: buildAplDocument(),
    datasources: {
      dashboardData: buildDashboardData(items, vehicleLabel, todayIso),
    },
  };
}

module.exports = {
  buildAplDocument,
  buildDashboardData,
  buildAplDirective,
  COLOURS,
};
