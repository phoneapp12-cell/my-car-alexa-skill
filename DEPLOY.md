# Car Due Dates — install guide

## Quick install (fresh import) — recommended

This sets up the whole skill and the Echo Show 15 widget in 5 steps. Stay signed in with the **same Amazon account** as your Echo the whole time. The skill stays private in **Development**, and you don't publish anything.

**Before you start:** your saved dates don't move to the new skill. Each skill keeps its own data, so the new one starts empty. If you want a record, say "Alexa, ask car due dates what's coming up" now and write the dates down.

1. **Create the skill by importing it.**
   Go to developer.amazon.com, open the **Alexa Developer Console** and click **Create Skill**.
   - Name: **Car Due Dates**
   - Language: **English (AU)**
   - Model: **Custom**
   - Hosting: **Alexa-hosted (Node.js)**. Keep the suggested region (US West (Oregon) for English (AU)).
   - When it asks you to pick a template, click **Import skill** instead and paste:
     `https://github.com/phoneapp12-cell/my-car-alexa-skill.git`
   - Click **Continue** (or **Create Skill**) and wait a couple of minutes.

2. **Add your two keys.**
   - In the new skill, go to **Build → Tools → Permissions** and scroll to the bottom. Copy **Alexa Client Id**, then click **SHOW** and copy **Alexa Client Secret**.
   - While you're on this page, check that **Reminders** is switched on.
   - Open the **Code** tab, then the file **lambda/config.js**. Replace the two `REPLACE_ME` values with your ID and secret, keeping the quote marks.
   - Click **Save**, then **Deploy**.

3. **Build.**
   - Go to **Build → Interfaces** and check that these are on: **Alexa Presentation Language**, **Data Store Packages**, **Data Store**, and **Data Store** under Alexa Extensions. If any are off, switch them on and click **Save Interfaces**.
   - Click **Build Model** (or **Build skill**) and wait until it says the build succeeded.

4. **Send the widget to your Echo Show 15.**
   - Go to **Build → Multimodal Responses → Widget**.
   - Open **CarDueDatesWidget** (click **Edit**).
   - At the bottom, click **Install**, pick your **Echo Show 15**, then click **Send to Device**.

5. **Delete the old skill, add the widget, and re-enter your dates.**
   - In the console skill list, delete your old "car due dates" skill (**Actions → Delete**). Two skills with the same invocation name confuse Alexa, and it may keep opening the old one.
   - On the Echo Show 15, wait a few minutes. If the widget isn't in the Widget Panel, swipe down from the top edge to open the **Widget Gallery**, find **Car Due Dates** and tap **+**.
   - Say **"Alexa, open car due dates"**, then add your dates again, for example: "set the WOF on Sarah's car to the first of June", "set the rego on Cass's car to the fifteenth of March", "record a service on Shane's car today at forty five thousand kilometres". The widget updates each time.

**If something doesn't match:**
- No **CarDueDatesWidget** in step 4: create it by hand. See "Add the widget to your Echo Show 15" → step D further down.
- An interface in step 3 won't stay on: follow step A in that same section.
- The widget stays empty: check `lambda/config.js` (step 2) and that you clicked **Deploy**.
- Not yet confirmed on a real account: that the import switches on the widget interfaces and the Reminders permission by itself, that **CarDueDatesWidget** appears automatically, and that a development-stage widget installs and updates on a NZ-registered Echo Show 15.

---

## Full manual setup (reference)

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

Confirm **Invocation Name** is `car due dates` (Build → Invocation).

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
   - `open car due dates`
   - `set the WOF on Sarah's car to the first of June twenty twenty seven`
   - `when's the WOF due`
   - `set the rego expiry to the fifteenth of March twenty twenty seven`
   - `record a service on Shane's car today at forty five thousand kilometres next service every six months`
   - `what's coming up`
   - `yes` (when offered a reminder)

### 8. Enable on your Echo Show 15

1. On your phone, open the **Amazon Alexa** app signed into the same account.
2. Go to **More → Skills & Games → Your Skills → Dev** (Development).
3. Find **My Car Tracker** (or the name you chose) and enable it if it is not already.
4. When the skill asks for **Reminders**, allow permission (or enable Reminders under the skill’s **Permissions** in the app).
5. On the Echo Show 15 (language English / Australia if available), say:

   **“Alexa, open car due dates”**

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

Three cars: **Sarah's car**, **Shane's car**, **Cass's car**. Name the car when setting, recording, or clearing.

| You say | Skill does |
|--------|------------|
| “Alexa, open car due dates” | Summary across all three cars + APL dashboard |
| “Set the WOF on Sarah's car to the first of June” | Saves Sarah's WOF; offers a 2-week reminder |
| “Set the rego on Cass's car to the fifteenth of March” | Saves Cass's rego (month-only → end of month) |
| “Record a service on Shane's car today at forty five thousand kilometres” | Logs Shane's service |
| “When’s the rego due on Cass's car?” | Status for that car |
| “When’s the WOF due?” | WOF status for every car that has one |
| “What’s coming up?” | All items across all cars, soonest/overdue first |
| “Clear the rego on Shane's car” | Clears that date |
| “Help” / “Stop” | Help text / exit |

If you omit the car on a set/record/clear, Alexa asks: “Which car, Sarah's, Shane's or Cass's?”

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

---

## Add the widget to your Echo Show 15

The widget shows all three cars (Sarah's, Shane's, Cass's) with Rego, WOF and Service: date, days left, and a green / amber / red dot. It updates by itself whenever you change a date by voice. Tapping it opens the skill.

The skill stays in **Development**. You don't need to publish anything.

Steps marked ✅ come straight from Amazon's docs. Steps marked ⚠️ are my best understanding but aren't confirmed.

### A. Turn on the widget interfaces ✅

1. Open your skill in the developer console → **Build** tab → **Interfaces**.
2. Turn on **Data Store Packages**.
3. Turn on **Data Store**.
4. Under **Alexa Extensions**, make sure **Data Store** is selected.
5. Leave **Alexa Presentation Language** on.
6. Click **Save Interfaces**, then **Build Model**.

⚠️ If the Data Store Packages option asks for a package ID, enter `CarDueDatesWidget`.

### B. Copy your skill's Client ID and Client Secret ✅

1. On the **Build** tab, open **Tools → Permissions** in the left menu.
2. Scroll to the bottom (the *Alexa Skill Messaging* section).
3. Copy **Alexa Client Id**.
4. Click **SHOW** and copy **Alexa Client Secret**.

Keep these private. Never paste them into GitHub.

### C. Update the code and fill in `config.js` (Code tab)

Alexa-hosted skills have no screen for Lambda environment variables, so the credentials go in a small file that exists only in your console, not in GitHub.

1. Open the **Code** tab.
2. Replace `lambda/index.js` with the new `lambda/index.js` from this project.
3. Add a new file, `lambda/widgetData.js`, and paste in this project's `lambda/widgetData.js`. ⚠️ Use the new-file icon above the file tree.
4. Open `lambda/config.js`, or add it and paste in this project's `lambda/config.js` if it's missing. Replace the two `REPLACE_ME` values with the Client ID and Client Secret from step B.
5. Click **Save**, then **Deploy**.

Leave `util.js`, `aplDocument.js` and `package.json` as they are. No new npm packages are needed.

### D. Create the widget in the widget authoring tool ✅

1. On the **Build** tab, click **Multimodal Responses** in the left menu, then **Widget**.
2. Click **Create Widget**, then **Blank Document**.
   - Or click **Upload** and choose `widget/widget-upload.json`. That file holds both the document and the data.
3. In the **APL** pane, replace everything with `widget/document.json`.
4. In the **DATA** pane, replace everything with `widget/data.json`.
5. Click **Save** and name the widget exactly **`CarDueDatesWidget`**. Amazon uses this name as the widget ID, and it has to match the skill code.
6. In the toolbar, click **Manifest**. Replace the JSON with `widget/manifest.json`, then save. This sets the gallery name to "Car Due Dates" and tells Alexa to notify the skill on install (`installStateChanges: INFORM`).
7. Go back to the **Build** tab and click **Build Model** again. Amazon says to rebuild after every widget change, or the install may fail or send an old version.

The preview in the tool has no data store connection, so it shows "Not set" and the "No dates yet" hint. That's expected.

### E. Install it on the Echo Show 15 ✅

1. In the widget authoring tool, click **Install** at the bottom of the page.
2. Pick your Echo Show 15 from the device menu.
3. Click **Send to Device**.
4. Wait a few minutes. Look for **Car Due Dates** in the Widget Panel. If it isn't there, open the Widget Gallery (on the Echo Show 15, swipe down from the top edge of the screen) and tap **+** on Car Due Dates.

### F. Fill it with your data

- Installing sends the skill a message and the skill pushes your dates straight away. If the widget still says "No dates yet", say **"Alexa, open car due dates"**. Every launch, and every set, record or clear, pushes fresh data.
- Optional display test: in the authoring tool, click **Install → Update Datastore**, paste in `widget/datastore-test-commands.json`, then click **Send to Datastore**. This shows sample dates. Your real data replaces them the next time you use the skill.

### Widget troubleshooting

- **Widget stays empty after using the skill.** Check that `lambda/config.js` has the right ID and secret and that you clicked **Deploy**. Open the Code tab's CloudWatch logs and look for lines that start with `[widget]`.
  - `not configured` means `config.js` is missing or still has `REPLACE_ME`.
  - `LWA token request failed` means the ID or secret is wrong.
  - `INVALID_DEVICE` means Alexa doesn't think the widget is installed on that device. Reinstall it (step E), then use the skill again.
- **Voice still works when a push fails.** Widget errors are logged and ignored.

### Not confirmed ⚠️

- **New Zealand devices:** I couldn't confirm that installing a widget from a development-stage skill works on a NZ-registered Echo Show 15. The skill is English (AU) and uses the Far East data store endpoint (`https://api.fe.amazonalexa.com`).
- **Device language:** the widget's gallery listing is English (AU). If the Echo is set to another language, the widget may not appear.
- **Pushes from a development skill:** one public developer report says they got `INVALID_DEVICE` when pushing from a development skill. If that happens to you, the Update Datastore button still works for testing, but automatic updates may not.
- **Removal events:** Amazon says the update event (`UpdateRequest`) is only sent for live skills. There are also reports that the removal event (`UsagesRemoved`) doesn't arrive in development.
- **Days-left counter:** the widget works out days left on the device from the due date and the device clock (`localTime`), so it should tick over each day without the skill. I haven't seen this confirmed on a real device.
