'use strict';

/**
 * Copy this file to config.js (same folder) in the Alexa-hosted Code tab and fill in
 * your skill's credentials so the widget can be updated automatically.
 *
 * Where to find them: developer console > your skill > Build > Tools > Permissions,
 * scroll to the bottom ("Alexa Skill Messaging"): copy Alexa Client Id, click SHOW,
 * copy Alexa Client Secret.
 *
 * NEVER commit config.js to a public repository. It is listed in .gitignore.
 */
module.exports = {
  skillClientId: 'amzn1.application-oa2-client.REPLACE_ME',
  skillClientSecret: 'REPLACE_ME',
  // Optional. Leave empty to use the endpoint Alexa sends with each request
  // (Far East https://api.fe.amazonalexa.com for English (AU) skills).
  dataStoreApiEndpoint: '',
};
