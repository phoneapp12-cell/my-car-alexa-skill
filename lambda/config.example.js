'use strict';

/**
 * Copy this file to config.js (in the Alexa developer console Code tab only) and fill in the values there.
 * config.js is gitignored. Never put real values into the public GitHub repository.
 *
 * Widget keys: developer console > Build > Tools > Permissions, bottom of the page:
 * "Alexa Client Id", and click SHOW for "Alexa Client Secret".
 * While a value says REPLACE_ME, the skill works normally but that feature is off.
 *
 * My App car dates (E1): in My App, Settings > Alexa > turn on "Share car dates with Alexa",
 * then use the two Copy buttons for the address and the key.
 */
module.exports = {
  skillClientId: 'REPLACE_ME',
  skillClientSecret: 'REPLACE_ME',
  // Optional. Leave empty to use the endpoint Alexa sends with each request
  // (Far East https://api.fe.amazonalexa.com for English (AU) skills).
  dataStoreApiEndpoint: '',
  // My App car dates. Leave as REPLACE_ME to keep using the skill's own saved dates only.
  RELAY_CARS_URL: 'REPLACE_ME',
  RELAY_CARS_KEY: 'REPLACE_ME',
};
