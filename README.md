# dribl-ics

A subscribable iCalendar (`.ics`) feed of your team's fixtures from [Dribl](https://dribl.com), generated daily by GitHub Actions and served free from GitHub Pages. Add the URL to your phone's calendar once and games appear automatically; rescheduled or cancelled matches update on their own.

Built around the Football Victoria Match Centre at `fv.dribl.com`, but works for any Dribl-hosted association (`fsa.dribl.com`, `footballtasmania.dribl.com`, etc.) — just change `subdomain` in `config.json`.

## How it works

```
GitHub Actions cron
   ↓
Playwright loads <subdomain>.dribl.com/fixtures/?season=…&club=…
   ↓
Intercepts the SPA's internal JSON API responses
   ↓
Generates docs/team.ics, commits, GitHub Pages serves it
   ↓
Your phone's calendar subscribes once, refreshes on its own
```

Dribl exposes no public API and no calendar export, so we drive a real headless browser to load the public Match Centre page (the same data anyone can see in the browser) and capture the JSON the SPA already fetches.

## Setup

### 1. Find your team's IDs

Open <https://fv.dribl.com/fixtures/> in a browser and use the filters (Club, Competition, Season) to narrow to your team. The URL bar will then look something like:

```
https://fv.dribl.com/fixtures/?date_range=default&season=ABC123&competition=XYZ789&club=DEF456
```

Copy the values of `season`, `competition`, and `club`.

### 2. Configure

Edit [`config.json`](./config.json):

```json
{
  "subdomain": "fv",
  "club": "DEF456",
  "season": "ABC123",
  "competition": "XYZ789",
  "teamFilter": "U13 Boys",
  "timezone": "Australia/Melbourne",
  "calendarName": "Lions U13 Boys Fixtures",
  "matchDurationMinutes": 90,
  "outputPath": "docs/team.ics"
}
```

- **`teamFilter`** is an optional case-insensitive substring matched against the team / grade name. If your club has many teams in the same competition, this narrows down to one specific team. Leave as `""` to keep everything.
- **`competition`** can be left as `""` to include all competitions for the club in the season.

### 3. Push to GitHub & enable Pages

1. Create a public repo (e.g. `dribl-ics`) and push this directory to it.
2. Repo → Settings → **Pages** → Source: **Deploy from a branch** → Branch: **`main`**, folder: **`/docs`** → Save.
3. Repo → Actions → enable Actions if prompted.
4. Repo → Actions → **Update Dribl ICS** → **Run workflow** to generate the first calendar (or wait for the daily cron at 17:00 UTC ≈ 03:00 Melbourne).

After the first successful run, your subscribe URL is:

```
https://massimoi79.github.io/dribl-ics/team.ics
```

There's also a friendly landing page at <https://massimoi79.github.io/dribl-ics/> with one-tap webcal links you can text to family.

## Subscribing on your phone

A subscribed calendar in iCloud cannot be shared with other Apple IDs, so each family member adds the URL on their own device. Setup is ~30 seconds each.

### iPhone (Apple Calendar)

Either tap **Open in Calendar** on the landing page, or:

1. Settings → Calendar → Accounts → Add Account → Other
2. **Add Subscribed Calendar**
3. Paste `https://massimoi79.github.io/dribl-ics/team.ics`
4. Save. Calendar refreshes by default every few hours; you can change this in the same screen.

### Android / Google Calendar

Android's native calendar can't subscribe to ICS URLs directly, so use Google Calendar:

1. On a desktop browser, open <https://calendar.google.com>
2. Other calendars → **From URL** → paste the URL → Add calendar
3. Open the Google Calendar app on the phone — fixtures appear there automatically.

### Outlook

Outlook on the web → Calendar → Add calendar → **Subscribe from web** → paste URL.

## Updating the schedule

- The GitHub Action runs once daily at 17:00 UTC (≈ 03:00 Melbourne, off-peak).
- To force a refresh now (e.g. you heard a fixture moved): repo → Actions → Update Dribl ICS → **Run workflow**.

Phone calendar apps cache subscribed feeds for a few hours independently, so a change you see on the GitHub Pages URL may take up to a day to appear on a phone.

## Local development

```bash
npm install
npx playwright install chromium
npm run scrape:dev      # runs against config.json
DEBUG_DRIBL=1 npm run scrape:dev   # also dumps captured JSON to ./captures/
```

If Dribl ever changes their internal JSON shape and the scraper finds zero fixtures, run with `DEBUG_DRIBL=1`, inspect the dumped responses, and update the heuristic key lists in [`src/extract.ts`](./src/extract.ts).

## Files

- [`config.json`](./config.json) — your team's IDs.
- [`src/scrape.ts`](./src/scrape.ts) — Playwright entry point.
- [`src/extract.ts`](./src/extract.ts) — finds fixture-shaped objects in any JSON shape Dribl returns.
- [`src/ics.ts`](./src/ics.ts) — turns fixtures into RFC 5545 iCalendar.
- [`.github/workflows/update.yml`](./.github/workflows/update.yml) — daily cron.
- [`docs/`](./docs/) — what GitHub Pages serves: `team.ics` plus a one-page subscribe UI.

## Caveats

- **Dribl's Terms of Service** prohibit reverse-engineering or automated probing of their systems. This project only loads the public Match Centre page that anyone can view in a browser, with one request per day, and stores no credentials. Use at your own discretion. If Dribl ever asks you to stop, stop.
- **Cloudflare** protects Dribl. Headless Chromium passes today; if it ever doesn't, swap to `playwright-extra` + stealth plugin (drop-in change in `src/scrape.ts`).
- This project is not affiliated with or endorsed by Dribl.

## License

MIT.
