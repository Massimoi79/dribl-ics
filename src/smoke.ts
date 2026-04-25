/**
 * Offline regression test: feeds a sample mirroring Dribl's actual
 * /api/fixtures JSON:API response through the full extract -> ICS pipeline.
 * Run via: npm run smoke
 */
import { writeFile } from "node:fs/promises";
import { findFixtures, sortByKickoff, filterByTeam } from "./extract.js";
import { buildIcs } from "./ics.js";
import type { Config } from "./types.js";

// Sample shape captured from mc-api.dribl.com/api/fixtures (real response,
// trimmed to a few records, three statuses, one bye).
const fakeApiResponse = {
  data: [
    {
      type: "fixtures",
      hash_id: "fixtureRec001",
      attributes: {
        match_hash_id: "matchAAA",
        date: "2026-04-25T23:30:00.000000Z",
        round: "R1",
        full_round: "Round 1",
        ground_name: "Park Avenue Reserve",
        ground_address: "12 Park Ave, Melbourne VIC",
        field_name: "Main Pitch (S) - Half Field B",
        home_team_name: "Manningham Juventus FC U13 Juniors - B Mixed U13",
        away_team_name: "Middle Park FC U13 Juniors - B Mixed",
        competition_name: "Junior Mixed Sunday (U12 - U16)",
        league_name: "Mixed Sunday East 13B",
        status: "pending",
        bye_flag: false,
      },
    },
    {
      type: "fixtures",
      hash_id: "fixtureRec002",
      attributes: {
        match_hash_id: "matchBBB",
        date: "2026-05-03T02:45:00.000000Z",
        round: "R2",
        full_round: "Round 2",
        ground_name: "Anderson Park",
        field_name: "(Junior) Half A",
        home_team_name: "Doncaster Rovers SC U13 Juniors - B Mixed",
        away_team_name: "Manningham Juventus FC U13 Juniors - B Mixed U13",
        competition_name: "Junior Mixed Sunday (U12 - U16)",
        league_name: "Mixed Sunday East 13B",
        status: "pending",
        bye_flag: false,
      },
    },
    {
      type: "fixtures",
      hash_id: "fixtureRec003",
      attributes: {
        match_hash_id: "matchCCC",
        date: "2026-05-10T02:45:00.000000Z",
        full_round: "Round 3",
        home_team_name: "Manningham Juventus FC U13 Juniors - B Mixed U13",
        away_team_name: "BYE",
        competition_name: "Junior Mixed Sunday (U12 - U16)",
        league_name: "Mixed Sunday East 13B",
        status: "pending",
        bye_flag: true,
      },
    },
    {
      type: "fixtures",
      hash_id: "fixtureRec004",
      attributes: {
        match_hash_id: "matchDDD",
        date: "2026-05-17T02:45:00.000000Z",
        full_round: "Round 4",
        ground_name: "Some Ground",
        home_team_name: "Other Club",
        away_team_name: "Manningham Juventus FC U13 Juniors - B Mixed U13",
        competition_name: "Junior Mixed Sunday (U12 - U16)",
        league_name: "Mixed Sunday East 13B",
        status: "cancelled",
        bye_flag: false,
      },
    },
  ],
  meta: { total: 4 },
};

const config: Config = {
  subdomain: "fv",
  club: "A4KLxY81Kq",
  season: "nPmrj2rmow",
  competition: "nPmrBVjAmo",
  league: "JmXJ64ozKn",
  teamFilter: "Manningham Juventus",
  timezone: "Australia/Melbourne",
  calendarName: "Smoke Test Calendar",
  matchDurationMinutes: 90,
  outputPath: "smoke.ics",
};

const map = findFixtures(fakeApiResponse);
const all = Array.from(map.values());
const filtered = filterByTeam(all, config.teamFilter);
const sorted = sortByKickoff(filtered);

console.log(`Extracted ${all.length} fixtures (4 in source, 1 bye expected to be filtered out).`);
console.log(`After teamFilter '${config.teamFilter}': ${sorted.length}\n`);
console.table(
  sorted.map((f) => ({
    id: f.id,
    kickoff: f.kickoff,
    matchup: `${f.homeTeam} vs ${f.awayTeam}`,
    round: f.round ?? "-",
    venue: f.venue ?? "-",
    field: f.field ?? "-",
    competition: f.competition ?? "-",
    status: f.status ?? "-",
  })),
);

const ics = buildIcs(sorted, config);
await writeFile(config.outputPath, ics, "utf8");
console.log(`\nWrote ${config.outputPath} (${ics.length} bytes)`);

// RFC 5545 line-folds long lines at 75 chars (continuation lines start with a space).
// Unfold for assertion purposes.
const unfolded = ics.replace(/\r?\n[ \t]/g, "");

const required = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "METHOD:PUBLISH",
  "UID:matchAAA@dribl-ics",
  "UID:matchBBB@dribl-ics",
  "UID:matchDDD@dribl-ics",
  "STATUS:CANCELLED",
  "SUMMARY:Manningham Juventus FC U13 Juniors - B Mixed U13 vs Middle Park FC U13 Juniors - B Mixed (Round 1)",
  "END:VCALENDAR",
];
const forbidden = [
  "UID:matchCCC@dribl-ics", // bye should be excluded
  "BYE",                    // bye opponent should not appear
];
const missing = required.filter((m) => !unfolded.includes(m));
const present = forbidden.filter((m) => unfolded.includes(m));

if (missing.length > 0) {
  console.error("\nMISSING expected ICS markers:", missing);
  process.exit(1);
}
if (present.length > 0) {
  console.error("\nFOUND forbidden ICS markers:", present);
  process.exit(1);
}
if (all.length !== 3) {
  console.error(`\nExpected 3 non-bye fixtures (1 of 4 was a bye), got ${all.length}`);
  process.exit(1);
}
if (sorted.length !== 3) {
  console.error(`\nExpected 3 fixtures after teamFilter, got ${sorted.length}`);
  process.exit(1);
}
console.log("\nICS smoke test passed (Dribl JSON:API shape).");
