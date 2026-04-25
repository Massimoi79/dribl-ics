import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Config } from "./types.js";

const PLACEHOLDER_PATTERN = /^REPLACE_WITH_/i;

export async function loadConfig(path = "config.json"): Promise<Config> {
  const raw = await readFile(resolve(path), "utf8");
  const parsed = JSON.parse(raw) as Partial<Config> & Record<string, unknown>;

  const config: Config = {
    subdomain: (parsed.subdomain ?? "fv") as string,
    club: parsed.club as string | undefined,
    season: parsed.season as string,
    competition: (parsed.competition as string | undefined) || undefined,
    league: (parsed.league as string | undefined) || undefined,
    teamFilter: (parsed.teamFilter as string | undefined) || undefined,
    timezone: (parsed.timezone as string) ?? "Australia/Melbourne",
    calendarName: (parsed.calendarName as string) ?? "Dribl Fixtures",
    matchDurationMinutes: (parsed.matchDurationMinutes as number) ?? 90,
    outputPath: (parsed.outputPath as string) ?? "docs/team.ics",
  };

  // Validate required identifiers are filled in.
  const required: Array<keyof Config> = ["subdomain", "season"];
  for (const key of required) {
    const value = config[key];
    if (typeof value !== "string" || !value || PLACEHOLDER_PATTERN.test(value)) {
      throw new Error(
        `config.json: '${key}' is required and must not be a placeholder. ` +
          `Open https://${config.subdomain}.dribl.com/fixtures/ in a browser, ` +
          `filter to your team, then copy the IDs from the URL into config.json.`,
      );
    }
  }
  if (config.club && PLACEHOLDER_PATTERN.test(config.club)) {
    throw new Error("config.json: 'club' is still a placeholder; replace or remove it.");
  }

  return config;
}

export function buildMatchCentreUrl(config: Config): string {
  const params = new URLSearchParams();
  params.set("date_range", "default");
  params.set("season", config.season);
  if (config.club) params.set("club", config.club);
  if (config.competition) params.set("competition", config.competition);
  if (config.league) params.set("league", config.league);
  params.set("timezone", config.timezone);
  return `https://${config.subdomain}.dribl.com/fixtures?${params.toString()}`;
}
