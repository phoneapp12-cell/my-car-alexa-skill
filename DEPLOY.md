# Deploy My Car Tracker (private / developer mode)

This skill is meant for **your own Echo devices** (including Echo Show 15) in **Development**, not published to the Alexa Skill Store. Sign in to the Alexa Developer Console with the **same Amazon account** that is registered on your Echo.

Locale: **English (AU)** only — Alexa has no en-NZ; New Zealand devices use en-AU.

Hosting: **Alexa-hosted (Node.js)** — no separate AWS account required.

Recommended hosting region for English (AU): **US West (Oregon)** / Far East (as shown in the console when you create the skill).

---

## Option A — Create skill, then paste / import files (most reliable)

### 1. Create the skill

1. Open [https://developer.amazon.com](https://developer.amazon.com) and sign in.
2. Open the **Alexa developer console** (Alexa → Alexa Skills Kit / Console).
3. Click **Create Skill**.
4. **Skill name:** e.g. `My Car Tracker` (display name; not the invocation name).
5. **Default language:** **English (AU)**.
6. **Model:** **Custom**.
7. **Hosting:** **Alexa-Hosted (Node.js)**.
8. Choose the hosting region suggested for English (AU) if asked.
9. Click **Create Skill**, then pick any starter **template** (e.g. Hello World) and continue. You will replace its content.

### 2. Interaction model

1. Open the **Build** tab.
2. In the left menu go to **Interaction Model → JSON Editor**.
3. Replace the entire JSON with the contents of:

   `skill-package/interactionModels/custom/en-AU.json`

4. Click **Save Model**.
5. Click **Build Model** and wait until it succeeds.

Confirm **Invocation Name** is `my car` (Build → Invocation).

### 3. Enable APL

1. Still under **Build**, open **Interfaces** (or **Models → Interfaces** depending on console layout).
2. Turn on **Alexa Presentation Language (APL)**.
3. **Save Interfaces**.

### 4. Reminders permission

1. Under **Build**, open **Tools → Permissions** (sometimes labelled **Permissions**).
2. Enable **Reminders**.
3. Save if prompted.

(This matches the permission declared in `skill-package/skill.json`: `alexa::alerts:reminders:skill:readwrite`.)

### 5. Paste Lambda code and deploy

1. Open the **Code** tab.
2. In the file tree, open `lambda/index.js` and replace it with this project’s `lambda/index.js`.
3. Add siblings under `lambda/` if missing:
   - `util.js` ← `lambda/util.js`
   - `aplDocument.js` ← `lambda/aplDocument.js`
4. Open `lambda/package.json` and replace with this project’s `lambda/package.json` (dependencies: `ask-sdk-core`, `ask-sdk-model`, `ask-sdk-s3-persistence-adapter`).
5. Click **Deploy**. Wait until deployment finishes.

**Alternative on Code tab:** use **Import Code** and upload a ZIP that contains a **root-level `lambda/` folder** (with `index.js`, `package.json`, `util.js`, `aplDocument.js`). Import Code brings in code only — not the interaction model — so you still need steps 2–4. Archives have size/file limits (see Amazon’s Alexa-hosted docs; keep the zip small).

### 6. Optional — sync skill manifest fields

If you want APL viewport metadata / publishing text from this repo:

- Some consoles expose **Build → Skill JSON / Manifest** or you can use ASK CLI. For a private skill it is enough that APL and Reminders are enabled in the UI as above.
- You do **not** need to publish the skill.

### 7. Test in the console

1. Open the **Test** tab.
2. Set the skill stage to **Development** (dropdown at the top).
3. Try typed/voice phrases, for example:
   - `open my car`
   - `set the WOF due date to the first of June twenty twenty seven`
   - `when's the WOF due`
   - `set the rego expiry to the fifteenth of March twenty twenty seven`
   - `record a service today at forty five thousand kilometres next service every six months`
   - `what's coming up`
   - `yes` (when offered a reminder)

### 8. Enable on your Echo Show 15

1. On your phone, open the **Amazon Alexa** app signed into the same account.
2. Go to **More → Skills & Games → Your Skills → Dev** (Development).
3. Find **My Car Tracker** (or the name you chose) and enable it if it is not already.
4. When the skill asks for **Reminders**, allow permission (or enable Reminders under the skill’s **Permissions** in the app).
5. On the Echo Show 15 (language English / Australia if available), say:

   **“Alexa, open my car”**

You should hear a summary and see the dashboard cards on the screen.

---

## Option B — Import from a public Git repository

Amazon supports creating an Alexa-hosted skill by importing a **public** Git repo (GitHub / GitLab / Bitbucket).

Verified in Amazon docs (*Import an Alexa-Hosted Skill from a Public Git Repository*):

1. Create Skill → Custom → Alexa-Hosted (Node.js) as in Option A.
2. On the template page, click **Import skill**.
3. Paste the repository’s `.git` HTTPS URL (public repo; archive under 50 MB).
4. Continue and wait for creation.

**Required layout** (this project already matches):

```text
car-tracker-skill/
├── lambda/
│   ├── index.js
│   ├── package.json
│   ├── util.js
│   └── aplDocument.js
└── skill-package/
    ├── skill.json
    └── interactionModels/
        └── custom/
            └── en-AU.json
```

After import, still verify:

- Interaction model built successfully  
- **APL** interface enabled  
- **Reminders** permission enabled  
- Test stage = **Development**  
- Skill enabled on the device account  

Private Git repos are **not** supported for this Import flow.

---

## Everyday phrases (NZ English)

| You say | Skill does |
|--------|------------|
| “Alexa, open my car” | Launch summary of what’s due next |
| “Set the rego expiry to the fifteenth of March” | Saves rego; offers a 2-week reminder |
| “Set the WOF due date to June” | Saves WOF (month-only → end of month); offers reminder |
| “Record a service today at forty five thousand kilometres, next service every six months” | Logs service + next due |
| “When’s the rego due?” / “When’s my WOF due?” / “When is the car due for a service?” | Status for that item |
| “What’s coming up?” | All items, soonest first, with days left / overdue |
| “Clear the WOF” | Clears that date |
| “Help” / “Stop” | Help text / exit |

Optional vehicle nickname or plate: add values under the `VEHICLE_NAME` type in the interaction model JSON if you have more than one car.

---

## Notes and caveats

- **Do not publish** unless you intentionally want store distribution. Development mode is enough for your Echo.
- Persistence uses Alexa-hosted **S3** via `S3_PERSISTENCE_BUCKET` / region env vars that Alexa sets automatically. No AWS console setup needed.
- Timezone: skill asks the device Settings API; if that fails it uses **Pacific/Auckland**.
- Reminder lead times: **14 days** before rego/WOF, **7 days** before service, at **9:00** local.
- Echo Show 15 (1st gen) should receive the APL dashboard when APL is enabled; voice-only devices get speech only.
- If model build fails on sample utterances, open JSON Editor errors, fix duplicates/typos, Save, Build again.
- Node runtime on Alexa-hosted is managed by Amazon (commonly Node 16.x+); do not change runtime after create.

---

## Files to copy (checklist)

- [ ] `skill-package/interactionModels/custom/en-AU.json` → Interaction Model JSON Editor  
- [ ] Enable APL interface  
- [ ] Enable Reminders permission  
- [ ] `lambda/index.js`  
- [ ] `lambda/util.js`  
- [ ] `lambda/aplDocument.js`  
- [ ] `lambda/package.json`  
- [ ] Deploy → Test (Development) → device  

Zip of this whole project: `car-tracker-skill.zip` (sibling of this folder).
