'use strict';

/**
 * Car Due Dates widget keys. Replace ONLY the two REPLACE_ME values, then Save and Deploy.
 *
 * Where to find them: developer console > Build tab > Tools > Permissions,
 * scroll to the bottom: copy "Alexa Client Id", click SHOW, copy "Alexa Client Secret".
 *
 * Edit this file only in the Alexa developer console Code tab (a private copy).
 * Never put real values into the public GitHub repository.
 * While the values say REPLACE_ME, the skill works normally but the widget is not updated.
 */
module.exports = {
  skillClientId: 'REPLACE_ME',
  skillClientSecret: 'REPLACE_ME',
  // Optional. Leave empty to use the endpoint Alexa sends with each request
  // (Far East https://api.fe.amazonalexa.com for English (AU) skills).
  dataStoreApiEndpoint: '',
};
