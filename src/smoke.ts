import { writeFile } from "node:fs/promises";
import { findFixtures, sortByKickoff, filterByTeam } from "./extract.js";
import { buildIcs } from "./ics.js";
import type { Config } from "./types.js";

const fakeApiResponse = {
  data: {
    fixtures: [
      {
        hashid: "match-001",
        kickoff_at: "2026-05-04T05:00:00Z",
        home_team: { name: "Lions U13" },
        away_team: { name: "Eagles U13" },
        venue: { name: "Smith Reserve", field: "Pitch 2", address: "12 Smith St, Melbourne VIC" },
        competition: { name: "U13 Boys NPL" },
        round: 5,
        status: "Scheduled",
      },
      {
        hashid: "match-002",
        kickoff_at: "2026-05-11T06:30:00Z",
        home_team: { name: "Tigers U13" },
        away_team: { name: "Lions U13" },
        venue: { name: "Tiger Park" },
        competition: { name: "U13 Boys NPL" },
        round: 6,
        status: "Scheduled",
      },
      {
        hashid: "match-003",
        kickoff_at: "2026-04-20T05:00:00Z",
        home_team: { name: "Lions U13" },
        away_team: { name: "Bears U13" },
        competition: { name: "U13 Boys NPL" },
        round: 3,
        status: "Cancelled",
      },
    ],
  },
};

const config: Config = {
  subdomain: "fv",
  club: "test",
  season: "test",
  competition: "test",
  teamFilter: "Lions",
  timezone: "Australia/Melbourne",
  calendarName: "Smoke Test Calendar",
  matchDurationMinutes: 90,
  outputPath: "smoke.ics",
};

const map = findFixtures(fakeApiResponse);
const all = Array.from(map.values());
const filtered = filterByTeam(all, config.teamFilter);
const sorted = sortByKickoff(filtered);

console.log(`Extracted ${all.length} fixtures, filtered to ${sorted.length}.`);
console.table(
  sorted.map((f) => ({
    id: f.id,
    kickoff: f.kickoff,
    summary: `${f.homeTeam} vs ${f.awayTeam}`,
    round: f.round,
    venue: f.venue ?? "-",
    status: f.status ?? "-",
  })),
);

const ics = buildIcs(sorted, config);
await writeFile(config.outputPath, ics, "utf8");
console.log(`Wrote ${config.outputPath} (${ics.length} bytes)`);

const required = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "METHOD:PUBLISH",
  "BEGIN:VEVENT",
  "UID:match-001@dribl-ics",
  "SUMMARY:Lions U13 vs Eagles U13",
  "STATUS:CANCELLED",
  "END:VEVENT",
  "END:VCALENDAR",
];
const missing = required.filter((m) => !ics.includes(m));
if (missing.length > 0) {
  console.error("Missing expected ICS markers:", missing);
  process.exit(1);
}
console.log("ICS smoke test passed.");
