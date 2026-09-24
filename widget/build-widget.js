'use strict';

/**
 * Generates the Car Due Dates APL widget package from one source of truth.
 *
 * Outputs:
 *   widget/document.json            -> authoring tool "APL" pane
 *   widget/data.json                -> authoring tool "DATA" pane (datasources)
 *   widget/manifest.json            -> authoring tool "Manifest" pane
 *   widget/widget-upload.json       -> { document, datasources } for the "Upload" option
 *   widget/datastore-test-commands.json -> sample for "Update Datastore" button
 *   skill-package/dataStorePackages/CarDueDatesWidget/... (APL package layout per docs)
 *
 * Run: node widget/build-widget.js
 */

const fs = require('fs');
const path = require('path');

const PACKAGE_ID = 'CarDueDatesWidget';
const NAMESPACE = 'carDueDates';
const KEY = 'dashboard';
const DS = 'DS_CarDueDates'; // dataBindingName
const DEF = 'widgetDefaults'; // datasource / mainTemplate parameter

const CARS = [
  { id: 'sarah', name: "Sarah's" },
  { id: 'shane', name: "Shane's" },
  { id: 'cass', name: "Cass's" },
];
const ITEMS = [
  { id: 'rego', label: 'Rego' },
  { id: 'wof', label: 'WOF' },
  { id: 'service', label: 'Service' },
];

const COLOURS = {
  green: '#2E7D32',
  amber: '#F9A825',
  red: '#D32F2F',
  unset: '#546E7A',
};

// Today as whole days since epoch, from APL local wall-clock time (ms).
const TODAY = 'Math.floor(localTime / 86400000)';

function dueDayExpr(car, item) {
  return `${DS}.${car}.${item}.dueDay`;
}

function dateTextBinding(car, item) {
  const p = `${DS}.${car}.${item}.dateText`;
  return `\${${p} ? ${p} : ${DEF}.notSetText}`;
}

function daysTextBinding(car, item) {
  const d = dueDayExpr(car, item);
  const diff = `(${d} - ${TODAY})`;
  return `\${${d} ? (${diff} < 0 ? 'Overdue ' + (0 - ${diff}) + 'd' : (${diff} == 0 ? 'Due today' : ${diff} + 'd left')) : ''}`;
}

function chipColourBinding(car, item) {
  const d = dueDayExpr(car, item);
  const diff = `(${d} - ${TODAY})`;
  return `\${${d} ? (${diff} < 0 ? '${COLOURS.red}' : (${diff} <= 30 ? '${COLOURS.amber}' : '${COLOURS.green}')) : '${COLOURS.unset}'}`;
}

function itemRow(car, item) {
  return {
    type: 'Container',
    width: '100%',
    grow: 1,
    direction: 'row',
    alignItems: 'center',
    items: [
      {
        type: 'Frame',
        width: '@chipSize',
        height: '@chipSize',
        borderRadius: '@chipRadius',
        backgroundColor: chipColourBinding(car.id, item.id),
      },
      {
        type: 'Text',
        text: item.label,
        width: '24%',
        paddingLeft: '@gap',
        fontSize: '@labelSize',
        fontWeight: '700',
        color: '#FFFFFF',
        maxLines: 1,
      },
      {
        type: 'Text',
        text: dateTextBinding(car.id, item.id),
        grow: 1,
        shrink: 1,
        fontSize: '@valueSize',
        color: '#ECEFF1',
        maxLines: 1,
      },
      {
        type: 'Text',
        text: daysTextBinding(car.id, item.id),
        fontSize: '@daysSize',
        fontWeight: '700',
        color: chipColourBinding(car.id, item.id),
        textAlign: 'right',
        maxLines: 1,
      },
    ],
  };
}

function carBlock(car, isLast) {
  return {
    type: 'Container',
    width: '100%',
    grow: 1,
    direction: 'column',
    paddingBottom: isLast ? 0 : '@gap',
    items: [
      {
        type: 'Text',
        text: `\${${DEF}.cars.${car.id}}`,
        fontSize: '@carNameSize',
        fontWeight: '700',
        color: '#90CAF9',
        maxLines: 1,
      },
      ...ITEMS.map((item) => itemRow(car, item)),
    ],
  };
}

function buildDocument() {
  return {
    type: 'APL',
    version: '2022.2',
    extensions: [
      { name: 'DataStore', uri: 'alexaext:datastore:10' },
    ],
    settings: {
      DataStore: {
        dataBindings: [
          {
            namespace: NAMESPACE,
            key: KEY,
            dataBindingName: DS,
            dataType: 'OBJECT',
          },
        ],
      },
    },
    resources: [
      {
        dimensions: {
          chipSize: '12dp',
          chipRadius: '6dp',
          gap: '6dp',
          titleSize: '20dp',
          carNameSize: '17dp',
          labelSize: '15dp',
          valueSize: '15dp',
          daysSize: '14dp',
          hintSize: '13dp',
        },
      },
      {
        when: '${viewport.width >= 300}',
        dimensions: {
          chipSize: '16dp',
          chipRadius: '8dp',
          gap: '8dp',
          titleSize: '24dp',
          carNameSize: '21dp',
          labelSize: '19dp',
          valueSize: '19dp',
          daysSize: '17dp',
          hintSize: '15dp',
        },
      },
    ],
    mainTemplate: {
      parameters: [DEF],
      items: [
        {
          type: 'TouchWrapper',
          id: 'openSkillTouch',
          width: '100vw',
          height: '100vh',
          onPress: [
            {
              type: 'SendEvent',
              arguments: ['openSkill'],
              flags: { interactionMode: 'STANDARD' },
            },
          ],
          item: {
            type: 'Container',
            width: '100%',
            height: '100%',
            direction: 'column',
            padding: '@gap',
            items: [
              {
                type: 'Frame',
                position: 'absolute',
                width: '100%',
                height: '100%',
                backgroundColor: '#11161C',
              },
              {
                type: 'Text',
                text: `\${${DEF}.title}`,
                fontSize: '@titleSize',
                fontWeight: '700',
                color: '#FFFFFF',
                maxLines: 1,
                paddingBottom: '@gap',
              },
              {
                type: 'Text',
                text: `\${${DEF}.emptyHint}`,
                display: `\${${DS} ? 'none' : 'normal'}`,
                fontSize: '@hintSize',
                color: '#B0BEC5',
                paddingBottom: '@gap',
              },
              ...CARS.map((car, i) => carBlock(car, i === CARS.length - 1)),
              {
                type: 'Text',
                text: `\${${DS}.updatedText ? ${DS}.updatedText : ${DEF}.footer}`,
                fontSize: '@hintSize',
                color: '#78909C',
                maxLines: 1,
                paddingTop: '@gap',
              },
            ],
          },
        },
      ],
    },
  };
}

function buildDatasources() {
  return {
    [DEF]: {
      title: 'Car Due Dates',
      emptyHint: 'No dates yet. Say "Alexa, open car due dates".',
      notSetText: 'Not set',
      footer: 'Tap to open',
      cars: {
        sarah: "Sarah's car",
        shane: "Shane's car",
        cass: "Cass's car",
      },
    },
  };
}

function buildManifest() {
  return {
    packageVersion: '1.0',
    packageType: 'APL_PACKAGE',
    publishingInformation: {
      schemaVersion: '1.0',
      locales: {
        'en-AU': [
          {
            targetViewport: 'WIDGET_M',
            metadata: {
              name: 'Car Due Dates',
              description: "Rego, WOF and service due dates for Sarah's, Shane's and Cass's cars.",
              keywords: ['car', 'rego', 'WOF', 'service'],
              iconUri: 'https://d3ozx4qyxcxwzd.cloudfront.net/default_icon.png',
              previews: ['https://d3ozx4qyxcxwzd.cloudfront.net/default_preview.png'],
            },
          },
        ],
      },
    },
    manifest: {
      id: PACKAGE_ID,
      version: '1.0.0',
      installStateChanges: 'INFORM',
      updateStateChanges: 'INFORM',
      presentationDefinitions: [{ url: 'presentations/default.tpl' }],
      appliesTo: "${viewport.mode == 'HUB'}",
    },
  };
}

function buildTpl() {
  return {
    type: 'APL_PRESENTATION',
    documentUrl: 'documents/document.json',
    datasourceUrl: 'datasources/default.json',
  };
}

function sampleCommands() {
  // Example payload shape the skill pushes (dueDay = whole days since 1970-01-01).
  const day = (iso) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86400000);
  return [
    {
      type: 'PUT_OBJECT',
      namespace: NAMESPACE,
      key: KEY,
      content: {
        updatedText: 'Sample data from authoring tool',
        sarah: {
          rego: { dateText: '15 Mar 2027', dueDay: day('2027-03-15') },
          wof: { dateText: '1 Jun 2027', dueDay: day('2027-06-01') },
          service: { dateText: null, dueDay: null },
        },
        shane: {
          rego: { dateText: '10 Oct 2026', dueDay: day('2026-10-10') },
          wof: { dateText: '1 Sep 2026', dueDay: day('2026-09-01') },
          service: { dateText: '24 Mar 2027', dueDay: day('2027-03-24') },
        },
        cass: {
          rego: { dateText: '31 Mar 2027', dueDay: day('2027-03-31') },
          wof: { dateText: null, dueDay: null },
          service: { dateText: null, dueDay: null },
        },
      },
    },
  ];
}

function write(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
}

function main() {
  const root = path.join(__dirname, '..');
  const doc = buildDocument();
  const ds = buildDatasources();
  const manifest = buildManifest();

  // Standalone copies for the authoring tool
  write(path.join(__dirname, 'document.json'), doc);
  write(path.join(__dirname, 'data.json'), ds);
  write(path.join(__dirname, 'manifest.json'), manifest);
  write(path.join(__dirname, 'widget-upload.json'), { document: doc, datasources: ds });
  write(path.join(__dirname, 'datastore-test-commands.json'), sampleCommands());

  // Skill package layout (APL Package Reference)
  const pkg = path.join(root, 'skill-package', 'dataStorePackages', PACKAGE_ID);
  write(path.join(pkg, 'manifest.json'), manifest);
  write(path.join(pkg, 'documents', 'document.json'), doc);
  write(path.join(pkg, 'datasources', 'default.json'), ds);
  write(path.join(pkg, 'presentations', 'default.tpl'), buildTpl());

  console.log(`Widget package ${PACKAGE_ID} written (namespace=${NAMESPACE}, key=${KEY}).`);
}

if (require.main === module) main();

module.exports = { PACKAGE_ID, NAMESPACE, KEY, buildDocument, buildDatasources, buildManifest };
