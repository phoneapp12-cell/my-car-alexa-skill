# My Car Tracker — private Alexa skill (en-AU / NZ)

Alexa-hosted (Node.js) skill for Shane Jenkins to track **rego**, **WOF**, and **servicing** on an Echo Show 15 (developer mode).

**Invocation:** `my car`  
**Locale:** `en-AU` (NZ devices use Australian English on Alexa)

## Layout

```text
lambda/           Skill code (ask-sdk-core + S3 persistence)
skill-package/    skill.json + interactionModels/custom/en-AU.json
tests/            Local handler tests (in-memory persistence)
DEPLOY.md         Step-by-step Developer Console deploy
```

## Local checks

```bash
cd lambda && npm install && npm run syntax && npm test
```

## Deploy

See **DEPLOY.md**. Do not publish; use Development stage on the same Amazon account as the Echo.
