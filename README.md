# Car Due Dates — private Alexa skill (en-AU / NZ)

Alexa-hosted (Node.js) skill for Shane Jenkins to track **rego**, **WOF**, and **servicing** for three cars on an Echo Show 15 (developer mode).

**Invocation:** `car due dates`  
**Locale:** `en-AU` (NZ devices use Australian English on Alexa)  
**Cars:** Sarah's car · Shane's car · Cass's car

## Layout

```text
lambda/           Skill code (ask-sdk-core + S3 persistence)
skill-package/    skill.json + interactionModels/custom/en-AU.json
tests/            Local handler tests (in-memory persistence)
DEPLOY.md         Step-by-step Developer Console deploy
```

## Example phrases

- “Alexa, open car due dates”
- “Set the WOF on Sarah's car to the first of June”
- “Sarah's car WOF is due the first of June”
- “When's the rego due on Cass's car”
- “When's the WOF due” (lists WOF for all cars that have one)
- “Record a service on Shane's car today at forty five thousand kilometres”
- “What's coming up”
- “Clear the rego on Shane's car”

## Local checks

```bash
cd lambda && npm install && npm run syntax && npm test
```

## Deploy / update

See **DEPLOY.md**. Public repo: https://github.com/phoneapp12-cell/my-car-alexa-skill  
Do not publish; use Development stage on the same Amazon account as the Echo.
