import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium, type BrowserContext, type Page, type Response } from "playwright";

import { buildMatchCentreUrl, loadConfig } from "./config.js";
import { filterByTeam, findFixtures, sortByKickoff } from "./extract.js";
import { buildIcs } from "./ics.js";
import type { Fixture } from "./types.js";

const DEBUG = process.env.DEBUG_DRIBL === "1";

async function captureJsonResponses(page: Page): Promise<unknown[]> {
  const captured: unknown[] = [];

  page.on("response", async (res: Response) => {
    try {
      const url = res.url();
      const ct = (res.headers()["content-type"] ?? "").toLowerCase();
      if (!ct.includes("json")) return;
      // Heuristic: only keep responses likely to contain fixture data.
      const isInteresting =
        /dribl\.com/i.test(url) &&
        /(fixture|match|event|game|schedule|competition|club|team)/i.test(url);
      if (!isInteresting) return;

      const body = await res.json().catch(() => null);
      if (body !== null) {
        captured.push(body);
        if (DEBUG) console.error(`  ↳ captured JSON from ${url}`);
      }
    } catch {
      // ignore
    }
  });

  return captured;
}

async function loadAllFixtures(page: Page): Promise<void> {
  // Wait for initial XHRs to settle.
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});

  // Click any "Load More" / "Show More" buttons until exhausted, scrolling between clicks.
  const loadMoreSelectors = [
    'button:has-text("Load More")',
    'button:has-text("Load more")',
    'button:has-text("Show More")',
    'button:has-text("Show more")',
    'button:has-text("More")',
    '[data-testid="load-more"]',
  ];

  for (let i = 0; i < 50; i++) {
    let clicked = false;
    for (const sel of loadMoreSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.scrollIntoViewIfNeeded().catch(() => {});
        await btn.click({ timeout: 5_000 }).catch(() => {});
        clicked = true;
        await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
        break;
      }
    }

    // Also progressively scroll to trigger any infinite-scroll loading.
    const before = await page.evaluate(() => document.body.scrollHeight);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(800);
    const after = await page.evaluate(() => document.body.scrollHeight);

    if (!clicked && before === after) break;
  }
}

async function persistDebugCaptures(captured: unknown[]): Promise<void> {
  if (!DEBUG) return;
  await mkdir("captures", { recursive: true });
  for (let i = 0; i < captured.length; i++) {
    await writeFile(`captures/response-${i}.json`, JSON.stringify(captured[i], null, 2));
  }
  console.error(`  ↳ wrote ${captured.length} captures to ./captures/`);
}

async function run(): Promise<void> {
  const config = await loadConfig();
  const url = buildMatchCentreUrl(config);
  console.log(`Loading ${url}`);

  const useChrome = process.env.PLAYWRIGHT_USE_CHROME === "1";
  const browser = await chromium.launch({
    headless: true,
    ...(useChrome ? { channel: "chrome" } : {}),
  });
  const context: BrowserContext = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    locale: "en-AU",
    timezoneId: config.timezone,
    viewport: { width: 1280, height: 1800 },
  });

  let fixtures: Fixture[] = [];
  let captureCount = 0;
  try {
    const page = await context.newPage();
    const captured = await captureJsonResponses(page);

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await loadAllFixtures(page);

    captureCount = captured.length;
    if (DEBUG) await persistDebugCaptures(captured);

    const map = new Map<string, Fixture>();
    for (const body of captured) findFixtures(body, map);
    fixtures = Array.from(map.values());
  } finally {
    await context.close();
    await browser.close();
  }

  console.log(`Captured ${captureCount} JSON responses, found ${fixtures.length} fixtures.`);

  if (config.teamFilter) {
    const before = fixtures.length;
    fixtures = filterByTeam(fixtures, config.teamFilter);
    console.log(`Filtered by '${config.teamFilter}': ${before} → ${fixtures.length}`);
  }

  fixtures = sortByKickoff(fixtures);

  if (fixtures.length === 0) {
    throw new Error(
      "No fixtures captured. Re-run with DEBUG_DRIBL=1 to dump the JSON Dribl is returning, then update src/extract.ts heuristics if the shape has changed.",
    );
  }

  const ics = buildIcs(fixtures, config);
  const outPath = resolve(config.outputPath);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, ics, "utf8");
  console.log(`Wrote ${fixtures.length} events to ${outPath}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
