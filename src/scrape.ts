import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium, type BrowserContext, type Page, type Response } from "playwright";

import { buildMatchCentreUrl, loadConfig } from "./config.js";
import { filterByTeam, findFixtures, sortByKickoff } from "./extract.js";
import { buildIcs } from "./ics.js";
import type { Fixture } from "./types.js";

const DEBUG = process.env.DEBUG_DRIBL === "1";
const CAPTURES_DIR = "captures";

interface CapturedResponse {
  url: string;
  status: number;
  contentType: string;
  body: unknown;
}

function safeFilename(s: string): string {
  return s.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 200);
}

function setupResponseCapture(page: Page): {
  captured: CapturedResponse[];
  responseLog: Array<{ url: string; status: number; contentType: string }>;
} {
  const captured: CapturedResponse[] = [];
  const responseLog: Array<{ url: string; status: number; contentType: string }> = [];

  page.on("response", async (res: Response) => {
    try {
      const url = res.url();
      const status = res.status();
      const contentType = (res.headers()["content-type"] ?? "").toLowerCase();
      responseLog.push({ url, status, contentType });

      if (!contentType.includes("json")) return;
      if (status < 200 || status >= 300) return;

      const body = await res.json().catch(() => null);
      if (body === null) return;
      captured.push({ url, status, contentType, body });
    } catch {
      // ignore — non-fatal
    }
  });

  return { captured, responseLog };
}

async function loadAllFixtures(page: Page): Promise<void> {
  // Give the SPA a chance to fetch its data.
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});

  // Try to wait for at least one row to render so we know data arrived.
  const fixtureSelectors = [
    '[data-testid*="fixture"]',
    '[class*="fixture"]',
    '[class*="Match"]',
    '[class*="match-card"]',
    "table tbody tr",
  ];
  for (const sel of fixtureSelectors) {
    const found = await page
      .locator(sel)
      .first()
      .waitFor({ state: "visible", timeout: 4_000 })
      .then(() => true)
      .catch(() => false);
    if (found) break;
  }

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

    const before = await page.evaluate(() => document.body.scrollHeight);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(800);
    const after = await page.evaluate(() => document.body.scrollHeight);

    if (!clicked && before === after) break;
  }
}

async function persistArtifacts(opts: {
  page: Page;
  captured: CapturedResponse[];
  responseLog: Array<{ url: string; status: number; contentType: string }>;
  failed: boolean;
}): Promise<void> {
  const { page, captured, responseLog, failed } = opts;
  // Always persist when we have nothing useful, when DEBUG is on, or on failure.
  const shouldPersist = DEBUG || failed || captured.length === 0;
  if (!shouldPersist) return;

  await mkdir(CAPTURES_DIR, { recursive: true });

  await writeFile(
    `${CAPTURES_DIR}/responses.log`,
    responseLog.map((r) => `${r.status}\t${r.contentType}\t${r.url}`).join("\n"),
    "utf8",
  );

  for (let i = 0; i < captured.length; i++) {
    const c = captured[i]!;
    const name = `response-${String(i).padStart(3, "0")}-${safeFilename(c.url)}.json`;
    await writeFile(`${CAPTURES_DIR}/${name}`, JSON.stringify(c.body, null, 2), "utf8");
  }

  await page
    .content()
    .then((html) => writeFile(`${CAPTURES_DIR}/page.html`, html, "utf8"))
    .catch(() => {});

  await page
    .screenshot({ path: `${CAPTURES_DIR}/page.png`, fullPage: true })
    .catch(() => {});

  console.error(
    `  ↳ wrote ${captured.length} JSON captures + responses.log + page.html + page.png to ./${CAPTURES_DIR}/`,
  );
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
  let captured: CapturedResponse[] = [];
  let responseLog: Array<{ url: string; status: number; contentType: string }> = [];
  let pageRef: Page | null = null;
  let runError: unknown = null;

  try {
    const page = await context.newPage();
    pageRef = page;
    const cap = setupResponseCapture(page);
    captured = cap.captured;
    responseLog = cap.responseLog;

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await loadAllFixtures(page);

    const map = new Map<string, Fixture>();
    for (const c of captured) findFixtures(c.body, map);
    fixtures = Array.from(map.values());
  } catch (err) {
    runError = err;
  } finally {
    if (pageRef) {
      await persistArtifacts({
        page: pageRef,
        captured,
        responseLog,
        failed: runError !== null || fixtures.length === 0,
      }).catch(() => {});
    }
    await context.close();
    await browser.close();
  }

  if (runError) throw runError;

  console.log(
    `Captured ${captured.length} JSON responses (${responseLog.length} total responses), found ${fixtures.length} fixtures.`,
  );

  if (responseLog.length > 0 && captured.length === 0) {
    console.log("Sample of responses received (no JSON matched):");
    for (const r of responseLog.slice(0, 20)) {
      console.log(`  ${r.status}  ${r.contentType.padEnd(30)}  ${r.url}`);
    }
  }

  if (config.teamFilter) {
    const before = fixtures.length;
    fixtures = filterByTeam(fixtures, config.teamFilter);
    console.log(`Filtered by '${config.teamFilter}': ${before} → ${fixtures.length}`);
  }

  fixtures = sortByKickoff(fixtures);

  if (fixtures.length === 0) {
    throw new Error(
      `No fixtures captured. Diagnostic artefacts have been saved to ./${CAPTURES_DIR}/. ` +
        `Inspect responses.log + page.html + page.png to see whether Cloudflare blocked the request, ` +
        `or whether the JSON shape changed and src/extract.ts needs adjusting.`,
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
